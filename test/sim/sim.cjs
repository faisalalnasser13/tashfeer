/**
 * Plays complete games through the REAL Cloud Function handlers, against
 * an in-memory Firestore that enforces transaction ordering.
 *
 *   node sim.js [gameCount]
 */

const fbs = require("firebase/firestore");
const eng = require("./lib/engine.cjs");
const fns = eng.api;
const { evaluate } = require("./lib/rules.cjs");

// The engine reads the signed-in uid from auth, so acting "as" someone
// means setting that first. Keeps the old call(fn, uid, data) shape.
const call = async (fn, uid, data) => { fbs.__setUser(uid); return fn(data); };
const admin = { __reset: fbs.__reset, __store: fbs.__store };

/* ---------------- helpers ---------------- */

let failures = [];
function check(cond, msg, ctx) {
  if (!cond) failures.push(`${msg}${ctx ? ` — ${JSON.stringify(ctx)}` : ""}`);
}
const S = () => admin.__store;
const room = (id) => S().get(`rooms/${id}`);
const rnd = (n) => Math.floor(Math.random() * n);

/* ---------------- one game ---------------- */

async function playGame(opts = {}) {
  admin.__reset();

  const {
    decryptAcc = 0.7,      // chance a team reads its own encryptor
    interceptAcc = 0.25,   // chance a team cracks the opponent
    silentEncryptorChance = 0, // chance an encryptor submits nothing
    perTeam = 2,
    maxRounds = 8,
    useReadyPath = false,  // exercise the "both teams sent" path instead of host force
  } = opts;

  // --- lobby -------------------------------------------------------
  const HOST = "u0";
  const { roomId } = await call(fns.createRoom, HOST, { name: "host", avatar: 0 });

  const uids = [HOST];
  for (let i = 1; i < perTeam * 2; i++) {
    const u = `u${i}`;
    uids.push(u);
    await call(fns.joinRoom, u, { roomId, name: `p${i}`, avatar: i });
  }
  for (let i = 0; i < uids.length; i++) {
    await call(fns.setTeam, uids[i], { roomId, team: i % 2 === 0 ? "gold" : "silver" });
  }
  await call(fns.updateSettings, HOST, { roomId, settings: { maxRounds } });
  await call(fns.startGame, HOST, { roomId });

  // --- play --------------------------------------------------------
  const seenCodes = { gold: new Set(), silver: new Set() };
  const encryptorLog = { gold: [], silver: [] };
  let guard = 0;

  while (room(roomId).phase !== "over") {
    if (++guard > 400) { check(false, "game never terminated"); break; }
    const r = room(roomId);

    if (r.phase === "encrypt") {
      for (const team of ["gold", "silver"]) {
        const enc = r.encryptor[team];
        encryptorLog[team].push(`r${r.round}:${enc}`);

        fbs.__setUser(enc);
        await eng.ensureCode(roomId, team, r.round);
        const secret = S().get(`rooms/${roomId}/secret/${team}_r${r.round}`);
        check(secret, "missing code doc", { team, round: r.round });
        if (secret) {
          const c = secret.code;
          check(
            c.length === 3 && new Set(c).size === 3 && c.every((d) => d >= 1 && d <= 4),
            "invalid code", { team, code: c }
          );
          const key = c.join("");
          check(!seenCodes[team].has(key), "code repeated within a game", { team, code: c });
          seenCodes[team].add(key);
          check(secret.encryptorUid === enc, "code assigned to wrong encryptor",
            { team, round: r.round, on: secret.encryptorUid, expected: enc });
        }

        if (Math.random() < silentEncryptorChance) continue; // stay silent
        const clues = [0, 1, 2].map((i) => `t${team}-r${r.round}-c${i}`);
        await call(fns.submitClues, enc, { roomId, clues });
      }
    }

    if (r.phase === "guess") {
      const wrong = (c) => (c ? [c[1], c[0], c[2]] : [1, 2, 3]);
      // Round 1: both teams decrypt at once (activeTeam null).
      const targets = r.round < 2 && !r.activeTeam
        ? ["gold", "silver"]
        : [r.activeTeam || "gold"];

      for (const active of targets) {
        const opp = active === "gold" ? "silver" : "gold";
        const clues = r.clues?.[active];
        if (!clues || clues.length !== 3) continue; // silent — skipped
        const code = S().get(`rooms/${roomId}/secret/${active}_r${r.round}`)?.code;
        const ownerPath = `rooms/${roomId}/drafts/${active}_r${r.round}`;
        const oppPath = `rooms/${roomId}/drafts/${opp}_r${r.round}`;
        const owner = S().get(ownerPath);
        const interceptor = S().get(oppPath);
        check(owner, "missing owner draft", { active, round: r.round });
        check(interceptor, "missing interceptor draft", { opp, round: r.round });

        if (owner) {
          owner.decrypt = Math.random() < decryptAcc ? [...code] : wrong(code);
          if (useReadyPath) owner.submittedDecrypt = r.teams[active].members[0];
        }
        if (interceptor && r.round >= 2) {
          interceptor.intercept = Math.random() < interceptAcc ? [...code] : wrong(code);
          if (useReadyPath) interceptor.submittedIntercept = r.teams[opp].members[0];
        }
      }
    }

    // advance
    if (useReadyPath && (r.phase === "encrypt" || r.phase === "guess")) {
      await call(fns.advancePhase, uids[1], {
        roomId, fromPhase: r.phase, fromRound: r.round,
      });
    } else {
      await call(fns.advancePhase, HOST, {
        roomId, force: true, fromPhase: r.phase, fromRound: r.round,
      });
    }
  }

  // --- verify ------------------------------------------------------
  const fin = room(roomId);
  const records = [...S().entries()]
    .filter(([k]) => k.startsWith(`rooms/${roomId}/rounds/`))
    .map(([, v]) => v)
    .sort((a, b) => a.round - b.round);

  check(records.length > 0, "no round records written");

  // round 1 never awards an interception
  const r1 = records.find((x) => x.round === 1);
  if (r1) {
    for (const t of ["gold", "silver"]) {
      check(r1.data[t].wasBreached === false, "interception awarded in round 1", { team: t });
    }
  }

  // scores must equal the sum of the round records
  const tally = { gold: { breach: 0, fault: 0 }, silver: { breach: 0, fault: 0 } };
  for (const rec of records) {
    for (const t of ["gold", "silver"]) {
      const opp = t === "gold" ? "silver" : "gold";
      if (rec.data[t].faulted) tally[t].fault++;
      if (rec.data[t].wasBreached) tally[opp].breach++;
    }
  }
  for (const t of ["gold", "silver"]) {
    check(tally[t].breach === fin.teams[t].score.breach,
      "breach total drifted from the round log", { team: t, tally: tally[t], score: fin.teams[t].score });
    check(tally[t].fault === fin.teams[t].score.fault,
      "fault total drifted from the round log", { team: t, tally: tally[t], score: fin.teams[t].score });
  }

  // a silent encryptor must always cost their own team
  for (const rec of records) {
    for (const t of ["gold", "silver"]) {
      if (rec.data[t].noClues) {
        check(rec.data[t].faulted, "silent encryptor did not produce a fault", { round: rec.round, team: t });
        check(!rec.data[t].wasBreached, "interception scored against a blank clue set", { round: rec.round, team: t });
      }
    }
  }

  // the declared winner must match the rules
  const g = fin.teams.gold.score, l = fin.teams.silver.score;
  if (fin.endReason !== "abandoned") {
    const v = evaluate(g, l, fin.round, fin.settings, fin.suddenDeath);
    check(v.done, "game ended while the rules say play on", { g, l, round: fin.round });
    check(v.winner === fin.winner, "winner disagrees with the rules engine",
      { declared: fin.winner, expected: v.winner, g, l });
  }
  // The eight keywords live in a sealed doc that rules only serve once
  // the phase is 'over'.
  const sealed = S().get(`rooms/${roomId}/final/keys`);
  check(sealed && sealed.gold.length === 4 && sealed.silver.length === 4,
    "the sealed keyword doc is missing or malformed");
  check(fin.phase === "over", "game did not reach the final screen", { phase: fin.phase });

  // the encryptor role must rotate
  for (const t of ["gold", "silver"]) {
    const log = encryptorLog[t];
    if (log.length >= 2 && perTeam >= 2) {
      const a = log[0].split(":")[1], b = log[1].split(":")[1];
      check(a !== b, "encryptor did not rotate", { team: t, log: log.slice(0, 3) });
    }
  }

  return { rounds: fin.round, winner: fin.winner, reason: fin.endReason, sudden: fin.suddenDeath };
}

/* ---------------- run ---------------- */

(async () => {
  const N = Number(process.argv[2] || 300);
  const stats = { winners: {}, reasons: {}, rounds: [], sudden: 0 };

  const configs = [
    { decryptAcc: 0.85, interceptAcc: 0.2 },
    { decryptAcc: 0.5, interceptAcc: 0.5 },
    { decryptAcc: 0.95, interceptAcc: 0.05 },   // long games, forces the round limit
    { decryptAcc: 0.3, interceptAcc: 0.3 },     // fast, messy games
    { decryptAcc: 0.7, interceptAcc: 0.3, silentEncryptorChance: 0.15 },
    { decryptAcc: 0.7, interceptAcc: 0.3, perTeam: 4 },
    { decryptAcc: 0.7, interceptAcc: 0.3, useReadyPath: true },
    { decryptAcc: 0.6, interceptAcc: 0.4, useReadyPath: true, perTeam: 4 },
    { decryptAcc: 0.9, interceptAcc: 0.02, maxRounds: 4 },
  ];

  for (let i = 0; i < N; i++) {
    const cfg = configs[i % configs.length];
    try {
      const res = await playGame(cfg);
      stats.winners[res.winner] = (stats.winners[res.winner] || 0) + 1;
      stats.reasons[res.reason] = (stats.reasons[res.reason] || 0) + 1;
      stats.rounds.push(res.rounds);
      if (res.sudden) stats.sudden++;
    } catch (e) {
      failures.push(`THREW (${JSON.stringify(cfg)}): ${e.message}`);
      if (failures.length > 8) break;
    }
  }

  console.log(`\nplayed ${N} games`);
  console.log("winners:", stats.winners);
  console.log("endings:", stats.reasons);
  console.log("sudden death:", stats.sudden);
  const rs = stats.rounds;
  if (rs.length) {
    console.log(`rounds: min ${Math.min(...rs)}, max ${Math.max(...rs)}, avg ${(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1)}`);
  }

  const uniq = [...new Set(failures)];
  if (uniq.length) {
    console.log(`\n${failures.length} failures (${uniq.length} distinct):`);
    uniq.slice(0, 12).forEach((f) => console.log("  ✗", f));
    process.exit(1);
  }
  console.log("\nall invariants held\n");
})();
