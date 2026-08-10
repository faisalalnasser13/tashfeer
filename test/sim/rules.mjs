/**
 * Targeted rule tests, plus a negative control proving the transaction
 * order detector actually fires (otherwise "all invariants held" in
 * sim.js would be meaningless for that check).
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fbs = require("firebase/firestore");
const eng = require("./lib/engine.cjs");
const fns = eng.api;

const call = async (fn, uid, data) => { fbs.__setUser(uid); return fn(data); };
const admin = { __reset: fbs.__reset, __store: fbs.__store };

let pass = 0, fail = 0;
const S = () => fbs.__store;

async function it(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function eq(a, b, m) { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
function assert(cond, m) { if (!cond) throw new Error(m || "assertion failed"); }
async function throws(fn, needle) {
  try { await fn(); } catch (e) {
    if (needle && !e.message.includes(needle)) throw new Error(`wrong error: ${e.message}`);
    return e;
  }
  throw new Error("expected a rejection, got none");
}

/* ---------------- fixture ---------------- */

async function freshGame(perTeam = 2) {
  admin.__reset();
  const HOST = "u0";
  const { roomId } = await call(fns.createRoom, HOST, { name: "host", avatar: 0 });
  const uids = [HOST];
  for (let i = 1; i < perTeam * 2; i++) {
    uids.push(`u${i}`);
    await call(fns.joinRoom, `u${i}`, { roomId, name: `p${i}`, avatar: i });
  }
  for (let i = 0; i < uids.length; i++) {
    await call(fns.setTeam, uids[i], { roomId, team: i % 2 === 0 ? "gold" : "silver" });
  }
  await call(fns.startGame, HOST, { roomId });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "keys", fromRound: 1 });
  {
    const rr = S().get(`rooms/${roomId}`);
    for (const t of ["gold", "silver"]) {
      fbs.__setUser(rr.encryptor[t]);
      await eng.ensureCode(roomId, t, 1);
    }
  }
  return { roomId, uids, HOST };
}
const room = (id) => S().get(`rooms/${id}`);
const keysOf = (id, t) => S().get(`rooms/${id}/private/${t}`).keys;

/* ================================================================== */

console.log("\nlobby");

await it("a game cannot start with fewer than two per team", async () => {
  admin.__reset();
  const { roomId } = await call(fns.createRoom, "a", { name: "a", avatar: 0 });
  await call(fns.joinRoom, "b", { roomId, name: "b", avatar: 1 });
  await call(fns.joinRoom, "c", { roomId, name: "c", avatar: 2 });
  await call(fns.setTeam, "a", { roomId, team: "gold" });
  await call(fns.setTeam, "b", { roomId, team: "gold" });
  await call(fns.setTeam, "c", { roomId, team: "silver" });
  await throws(() => call(fns.startGame, "a", { roomId }), "لاعبَين");
});

await it("only the host can start", async () => {
  admin.__reset();
  const { roomId } = await call(fns.createRoom, "a", { name: "a", avatar: 0 });
  for (const u of ["b", "c", "d"]) await call(fns.joinRoom, u, { roomId, name: u, avatar: 1 });
  await call(fns.setTeam, "a", { roomId, team: "gold" });
  await call(fns.setTeam, "b", { roomId, team: "gold" });
  await call(fns.setTeam, "c", { roomId, team: "silver" });
  await call(fns.setTeam, "d", { roomId, team: "silver" });
  await throws(() => call(fns.startGame, "b", { roomId }), "للمضيف");
});

await it("the two teams get different keywords", async () => {
  const { roomId } = await freshGame();
  const g = keysOf(roomId, "gold"), l = keysOf(roomId, "silver");
  eq(g.length, 4, "gold key count");
  eq(new Set([...g, ...l]).size, 8, "all eight keywords distinct");
});

await it("host migrates when the host leaves", async () => {
  admin.__reset();
  const { roomId } = await call(fns.createRoom, "a", { name: "a", avatar: 0 });
  await call(fns.joinRoom, "b", { roomId, name: "b", avatar: 1 });
  await call(fns.leaveRoom, "a", { roomId });
  eq(room(roomId).hostUid, "b", "host did not migrate");
});

console.log("\nclue validation");

await it("a clue may not be one of your own keywords", async () => {
  const { roomId } = await freshGame();
  const enc = room(roomId).encryptor.gold;
  const mine = keysOf(roomId, "gold");
  await throws(
    () => call(fns.submitClues, enc, { roomId, clues: [mine[0], "شيء", "آخر"] }),
    "كلماتكم"
  );
});

await it("the definite article does not smuggle a keyword through", async () => {
  const { roomId } = await freshGame();
  const enc = room(roomId).encryptor.gold;
  const mine = keysOf(roomId, "gold");
  await throws(
    () => call(fns.submitClues, enc, { roomId, clues: [`ال${mine[1]}`, "شيء", "آخر"] }),
    "كلماتكم"
  );
});

await it("a clue cannot be reused in a later round", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  // Nonsense clues — real bank words can randomly be a team's keywords.
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["قققا", "قققب", "قققج"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["فففا", "فففب", "فففج"] });
  for (const p of ["encrypt", "guess", "reveal", "guess", "reveal", "roundEnd"]) {
    await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: p, fromRound: 1 });
  }
  eq(room(roomId).round, 2, "did not reach round 2");
  await throws(
    () => call(fns.submitClues, room(roomId).encryptor.gold, { roomId, clues: ["قققا", "نننا", "نننب"] }),
    "جولة سابقة"
  );
});

await it("normalisation catches a respelled repeat", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["أقققا", "قققب", "قققج"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["فففا", "فففب", "فففج"] });
  for (const p of ["encrypt", "guess", "reveal", "guess", "reveal", "roundEnd"]) {
    await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: p, fromRound: 1 });
  }
  // same word, alif hamza dropped
  await throws(
    () => call(fns.submitClues, room(roomId).encryptor.gold, { roomId, clues: ["اقققا", "نننا", "نننب"] }),
    "جولة سابقة"
  );
});

await it("the three clues in one round must differ", async () => {
  const { roomId } = await freshGame();
  await throws(
    () => call(fns.submitClues, room(roomId).encryptor.gold, { roomId, clues: ["قققا", "قققا", "قققب"] }),
    "مكررة"
  );
});

await it("a non-encryptor cannot submit clues", async () => {
  const { roomId } = await freshGame();
  const r = room(roomId);
  const other = r.teams.gold.members.find((m) => m !== r.encryptor.gold);
  await throws(() => call(fns.submitClues, other, { roomId, clues: ["a", "b", "c"] }), "المُشفِّر");
});

await it("empty clues are rejected", async () => {
  const { roomId } = await freshGame();
  await throws(
    () => call(fns.submitClues, room(roomId).encryptor.gold, { roomId, clues: ["نار", "  ", "بحر"] }),
    "فارغًا"
  );
});

console.log("\nphase machine");

await it("a non-host cannot force a phase early", async () => {
  const { roomId, uids } = await freshGame();
  await throws(
    () => call(fns.advancePhase, uids[1], { roomId, force: true, fromPhase: "encrypt", fromRound: 1 }),
    "للمضيف"
  );
});

await it("a stale advance call is ignored, not replayed", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["a1", "a2", "a3"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["b1", "b2", "b3"] });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "encrypt", fromRound: 1 });
  eq(room(roomId).phase, "guess", "first advance");
  // same call arriving late from another client
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "encrypt", fromRound: 1 });
  eq(room(roomId).phase, "guess", "duplicate advance moved the game");
});

await it("both clue sets in ends the encrypt phase without the host", async () => {
  const { roomId, uids } = await freshGame();
  const r = room(roomId);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["a1", "a2", "a3"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["b1", "b2", "b3"] });
  await call(fns.advancePhase, uids[3], { roomId, fromPhase: "encrypt", fromRound: 1 });
  eq(room(roomId).phase, "guess", "readiness path did not advance");
});

await it("a half-ready table does not advance", async () => {
  const { roomId, uids } = await freshGame();
  const r = room(roomId);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["a1", "a2", "a3"] });
  await throws(
    () => call(fns.advancePhase, uids[1], { roomId, fromPhase: "encrypt", fromRound: 1 }),
    "الوقت"
  );
});

console.log("\nscoring");

await it("a silent encryptor costs their own team and shields them from interception", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  // gold says nothing; silver speaks
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["b1", "b2", "b3"] });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "encrypt", fromRound: 1 });

  // Round 1 is simultaneous — gold has nothing to guess; silver decrypts.
  const silverCode = S().get(`rooms/${roomId}/secret/silver_r1`).code;
  S().get(`rooms/${roomId}/drafts/silver_r1`).decrypt = [...silverCode];
  S().get(`rooms/${roomId}/drafts/silver_r1`).submittedDecrypt = r.encryptor.silver;
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "guess", fromRound: 1 });

  const rec = S().get(`rooms/${roomId}/rounds/1`);
  eq(rec.data.gold.noClues, true, "gold should be marked silent");
  eq(rec.data.gold.faulted, true, "silence must produce a fault");
  eq(rec.data.gold.wasBreached, false, "nothing to intercept");
  eq(room(roomId).teams.silver.score.breach, 0, "silver must not score off silence");
  eq(room(roomId).activeTeam, null, "round-1 dual reveal");
});

await it("round one awards no interception even on a perfect read", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["a1", "a2", "a3"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["b1", "b2", "b3"] });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "encrypt", fromRound: 1 });

  const goldCode = S().get(`rooms/${roomId}/secret/gold_r1`).code;
  const silverCode = S().get(`rooms/${roomId}/secret/silver_r1`).code;
  S().get(`rooms/${roomId}/drafts/gold_r1`).decrypt = [...goldCode];
  S().get(`rooms/${roomId}/drafts/silver_r1`).decrypt = [...silverCode];
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "guess", fromRound: 1 });

  const sc = room(roomId).teams;
  eq(sc.gold.score.breach, 0, "gold scored in round 1");
  eq(sc.silver.score.breach, 0, "silver scored in round 1");
  eq(sc.gold.score.fault, 0, "gold read correctly, should be clean");
  eq(sc.silver.score.fault, 0, "silver read correctly, should be clean");
  eq(room(roomId).activeTeam, null, "dual reveal after simultaneous guess");
});

await it("understanding your own encryptor earns nothing", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["a1", "a2", "a3"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["b1", "b2", "b3"] });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "encrypt", fromRound: 1 });

  S().get(`rooms/${roomId}/drafts/gold_r1`).decrypt =
    [...S().get(`rooms/${roomId}/secret/gold_r1`).code];
  S().get(`rooms/${roomId}/drafts/silver_r1`).decrypt =
    [...S().get(`rooms/${roomId}/secret/silver_r1`).code];
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "guess", fromRound: 1 });
  const sc = room(roomId).teams;
  eq(sc.gold.score.breach + sc.gold.score.fault, 0, "gold should have no tokens at all");
});

await it("a silent encryptor in later rounds skips guess and intercept", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["a1", "a2", "a3"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["b1", "b2", "b3"] });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "encrypt", fromRound: 1 });
  S().get(`rooms/${roomId}/drafts/gold_r1`).decrypt =
    [...S().get(`rooms/${roomId}/secret/gold_r1`).code];
  S().get(`rooms/${roomId}/drafts/silver_r1`).decrypt =
    [...S().get(`rooms/${roomId}/secret/silver_r1`).code];
  for (const p of ["guess", "reveal", "roundEnd"]) {
    await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: p, fromRound: 1 });
  }
  eq(room(roomId).round, 2, "did not reach round 2");

  const r2 = room(roomId);
  for (const t of ["gold", "silver"]) {
    fbs.__setUser(r2.encryptor[t]);
    await eng.ensureCode(roomId, t, 2);
  }
  await call(fns.submitClues, r2.encryptor.silver, { roomId, clues: ["c1", "c2", "c3"] });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "encrypt", fromRound: 2 });

  eq(room(roomId).phase, "reveal", "silent gold should skip guess");
  eq(room(roomId).activeTeam, "gold", "revealing the silent half");
  const rec = S().get(`rooms/${roomId}/rounds/2`);
  eq(rec.data.gold.noClues, true, "gold marked silent");
  eq(rec.data.gold.faulted, true, "miscommunication fault");
  eq(rec.data.gold.wasBreached, false, "no interception on silence");
  eq(room(roomId).teams.silver.score.breach, 0, "no breach token from silence");
});

console.log("\nmid-game join / leave");

await it("mid-game joiner gets a guesses sheet and is on teammates' members lists", async () => {
  const { roomId, HOST } = await freshGame();
  await call(fns.joinRoom, "late", { roomId, name: "late", avatar: 9 });
  const r = room(roomId);
  const team = r.players.late.team;
  assert(team === "gold" || team === "silver", "joiner was not seated");
  const sheet = S().get(`rooms/${roomId}/guesses/late`);
  assert(sheet, "joiner has no guess sheet");
  eq(sheet.team, team, "sheet team");
  assert(sheet.members.includes("late"), "joiner missing from own members");
  for (const u of r.teams[team].members) {
    const g = S().get(`rooms/${roomId}/guesses/${u}`);
    assert(g?.members?.includes("late"), `${u} guess.members missing joiner`);
  }
  // Showdown seed must not throw on the new sheet.
  r.round = 8;
  r.showdown = true;
  r.phase = "roundEnd";
  r.winner = null;
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "roundEnd", fromRound: 8 });
  eq(room(roomId).phase, "showdown", "showdown entered with mid-game joiner");
});

await it("leaveRoom reassigns the encryptor and drops private/guess membership", async () => {
  const { roomId } = await freshGame();
  const r0 = room(roomId);
  const enc = r0.encryptor.gold;
  const other = r0.teams.gold.members.find((m) => m !== enc);
  assert(other, "need a teammate");
  await call(fns.leaveRoom, enc, { roomId });
  const r = room(roomId);
  eq(r.encryptor.gold, other, "encryptor not reassigned");
  assert(!r.teams.gold.members.includes(enc), "leaver still on team");
  assert(!S().get(`rooms/${roomId}/guesses/${enc}`), "leaver guess sheet not deleted");
  const priv = S().get(`rooms/${roomId}/private/gold`);
  assert(!priv.members.includes(enc), "leaver still on private.members");
  for (const u of r.teams.gold.members) {
    const g = S().get(`rooms/${roomId}/guesses/${u}`);
    assert(!g?.members?.includes(enc), `${u} still lists leaver`);
  }
});

console.log("\nevaluate / showdown");

const { evaluate, scoreShowdown } = require("./lib/rules.cjs");
const settings = { encryptSecs: 60, guessSecs: 60, maxRounds: 8, useTimer: true };

await it("a points tie at the round limit queues showdown", async () => {
  const v = evaluate(
    { breach: 1, fault: 1 }, { breach: 1, fault: 1 },
    8, settings, false
  );
  eq(v.done, false, "done");
  eq(v.showdown, true, "showdown");
  eq(v.reason, undefined, "no end reason yet");
});

await it("clean breach still wins before showdown", async () => {
  const v = evaluate(
    { breach: 2, fault: 0 }, { breach: 0, fault: 0 },
    3, settings, false
  );
  eq(v.done, true, "done");
  eq(v.winner, "gold", "winner");
  eq(v.reason, "breach", "reason");
});

await it("points decide a tangled end without showdown", async () => {
  // Both teams hit a decisive token at once → fall through to points.
  const v = evaluate(
    { breach: 2, fault: 0 }, { breach: 2, fault: 1 },
    5, settings, false
  );
  eq(v.done, true, "done");
  eq(v.winner, "gold", "winner");
  eq(v.reason, "points", "reason");
});

await it("scoreShowdown matches diacritics and alef variants", async () => {
  const keys = { gold: ["أسد", "رماد", "قمر", "بحر"], silver: ["نار", "ظل", "ريح", "جبل"] };
  const guesses = {
    // gold guesses silver's keys
    gold: ["نار", "ظِل", "ريح", "جبل"],
    // silver guesses gold's keys with alef / tashkeel variants
    silver: ["اسد", "رَماد", "قمر", "بحر"],
  };
  const r = scoreShowdown(guesses, keys);
  eq(r.hits.gold, 4, "gold hits");
  eq(r.hits.silver, 4, "silver hits");
  eq(r.winner, "draw", "equal hits");
});

await it("scoreShowdown ignores empty guesses", async () => {
  const keys = { gold: ["أ", "ب", "ج", "د"], silver: ["ه", "و", "ز", "ح"] };
  const r = scoreShowdown(
    { gold: ["", "", "", ""], silver: ["أ", "", "ج", ""] },
    keys
  );
  eq(r.hits.gold, 0, "empty gold");
  eq(r.hits.silver, 2, "partial silver");
  eq(r.winner, "silver", "winner");
});

await it("showdown phase seeds theories and resolves by hits", async () => {
  const { roomId, HOST } = await freshGame();
  // Force a tied board at round limit.
  const r = room(roomId);
  r.round = 8;
  r.showdown = true;
  r.teams.gold.score = { breach: 1, fault: 1 };
  r.teams.silver.score = { breach: 1, fault: 1 };
  r.phase = "roundEnd";
  r.winner = null;
  r.endReason = null;

  S().get(`rooms/${roomId}/private/gold`).theories = {
    "1": "ه", "2": "و", "3": "ز", "4": "ح",
  };
  const sealed = S().get(`rooms/${roomId}/final/keys`);
  // Gold theories match silver keys → 4 hits if silver keys are ه و ز ح
  sealed.silver = ["ه", "و", "ز", "ح"];
  sealed.gold = ["أ", "ب", "ج", "د"];
  S().get(`rooms/${roomId}/private/silver`).theories = {
    "1": "خطأ", "2": "خطأ", "3": "خطأ", "4": "خطأ",
  };

  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "roundEnd", fromRound: 8 });
  eq(room(roomId).phase, "showdown", "entered showdown");
  const gWords = S().get(`rooms/${roomId}/guesses/${room(roomId).teams.gold.members[0]}`).words;
  eq(gWords["1"], "ه", "seeded from theories");

  await call(fns.submitShowdown, room(roomId).teams.gold.members[0], {
    roomId, words: ["ه", "و", "ز", "ح"],
  });
  await call(fns.submitShowdown, room(roomId).teams.silver.members[0], {
    roomId, words: ["خطأ", "خطأ", "خطأ", "خطأ"],
  });
  await call(fns.advancePhase, HOST, { roomId, fromPhase: "showdown", fromRound: 8 });
  eq(room(roomId).phase, "over", "ended");
  eq(room(roomId).winner, "gold", "gold won on hits");
  eq(room(roomId).endReason, "showdown", "reason");
  eq(room(roomId).showdownHits.gold, 4, "gold hits stored");
  eq(room(roomId).showdownHits.silver, 0, "silver hits stored");
});

await it("equal showdown hits break on cumulative encrypt/decrypt time", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  r.round = 8;
  r.showdown = true;
  r.phase = "roundEnd";
  r.winner = null;
  r.submitMs = { gold: 12_000, silver: 40_000 };
  const sealed = S().get(`rooms/${roomId}/final/keys`);
  sealed.gold = ["أ", "ب", "ج", "د"];
  sealed.silver = ["ه", "و", "ز", "ح"];

  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "roundEnd", fromRound: 8 });
  // Both teams guess nothing useful → 0–0 hits; gold has less submitMs.
  await call(fns.submitShowdown, room(roomId).teams.gold.members[0], {
    roomId, words: ["", "", "", ""],
  });
  await call(fns.submitShowdown, room(roomId).teams.silver.members[0], {
    roomId, words: ["", "", "", ""],
  });
  await call(fns.advancePhase, HOST, { roomId, fromPhase: "showdown", fromRound: 8 });
  eq(room(roomId).winner, "gold", "faster team wins");
  eq(room(roomId).showdownTimeBreak, true, "time break flagged");
  eq(room(roomId).endReason, "showdown", "reason");
});

console.log("\nnegative control");

await it("the transaction order detector really fires", async () => {
  // Firestore rejects a read that happens after a write in the same
  // transaction. Proving the harness catches it means the "all invariants
  // held" result elsewhere actually covers transaction ordering.
  const a = fbs.doc(fbs.getFirestore(), "x", "1");
  const b = fbs.doc(fbs.getFirestore(), "x", "2");
  await throws(
    () => fbs.runTransaction(null, async (tx) => {
      await tx.get(a);
      tx.set(a, { v: 1 });
      await tx.get(b);      // read after write — must be caught
    }),
    "TRANSACTION ORDER VIOLATION"
  );
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
