/**
 * What happens when teammates disagree.
 *
 * The draft is the one document clients write to directly, so every
 * conflict in the game funnels through it. These tests replicate the
 * exact client-side write semantics from src/lib/hooks.ts and then check
 * what the server locks in.
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
function eq(a, b, m) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}: got ${A}, want ${B}`);
}
async function throws(fn, needle) {
  try { await fn(); } catch (e) {
    if (needle && !e.message.includes(needle)) throw new Error(`wrong error: ${e.message}`);
    return;
  }
  throw new Error("expected a rejection, got none");
}

/* ---------------- client-side write semantics ---------------- */
/* These mirror useDraft() exactly. If hooks.ts changes, change these.  */

function clientSetCode(path, field, values) {
  const d = S().get(path);
  if (field === "decrypt" && d.submittedDecrypt) return;
  if (field === "intercept" && d.submittedIntercept) return;
  d[field] = values;
}
function clientAssign(path, field, slot, digit) {
  // Cartouche: a digit can only live in one slot, so taking it frees it.
  const cur = S().get(path)[field];
  clientSetCode(path, field, cur.map((v, i) => (i === slot ? digit : v === digit ? null : v)));
}
function clientSubmit(path, uid, field = "decrypt") {
  const d = S().get(path);
  const key = field === "decrypt" ? "submittedDecrypt" : "submittedIntercept";
  if (!d[key]) d[key] = uid;   // first tap wins
}

/* ---------------- fixture ---------------- */

async function atGuessPhase(perTeam = 3) {
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
  const r = S().get(`rooms/${roomId}`);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["g1", "g2", "g3"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["l1", "l2", "l3"] });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "encrypt", fromRound: 1 });

  const room = S().get(`rooms/${roomId}`);
  const gold = room.teams.gold.members;
  const draft = `rooms/${roomId}/drafts/gold_r1`;
  return {
    roomId, HOST, room, gold, draft,
    // the two teammates who are NOT the encryptor — they own the decryption
    a: gold.find((m) => m !== room.encryptor.gold),
    b: gold.filter((m) => m !== room.encryptor.gold)[1],
    enc: room.encryptor.gold,
    code: S().get(`rooms/${roomId}/secret/gold_r1`).code,
  };
}

/* ================================================================== */

console.log("\ntwo teammates editing at once");

await it("the last edit wins and both see the same numbers", async () => {
  const { draft } = await atGuessPhase();
  clientSetCode(draft, "decrypt", [1, 2, 3]);   // A's theory
  clientSetCode(draft, "decrypt", [4, 3, 2]);   // B disagrees
  eq(S().get(draft).decrypt, [4, 3, 2], "final state");
});

await it("a tug-of-war never leaves a duplicated digit", async () => {
  const { draft } = await atGuessPhase();
  // A and B stab at the same slots in an interleaved mess
  const moves = [[0,3],[1,3],[2,3],[0,1],[1,1],[2,4],[0,2],[1,4],[2,1],[0,4]];
  for (const [slot, digit] of moves) clientAssign(draft, "decrypt", slot, digit);
  const d = S().get(draft).decrypt.filter((v) => v !== null);
  eq(new Set(d).size, d.length, "a digit appeared in two slots at once");
});

await it("each team's fight is invisible to the other", async () => {
  const { roomId, draft } = await atGuessPhase();
  const theirs = `rooms/${roomId}/drafts/silver_r1`;
  clientSetCode(draft, "decrypt", [1, 2, 3]);
  clientSetCode(theirs, "decrypt", [4, 3, 2]);
  eq(S().get(draft).decrypt, [1, 2, 3], "gold's draft was disturbed");
  eq(S().get(theirs).decrypt, [4, 3, 2], "silver's draft was disturbed");
});

console.log("\nsending");

await it("any teammate can send — no confirmation round", async () => {
  const { roomId, draft, b } = await atGuessPhase();
  clientSetCode(draft, "decrypt", [1, 2, 3]);
  clientSubmit(draft, b, "decrypt");
  eq(S().get(draft).submittedDecrypt, b, "b's tap did not send it");
});

await it("the encryptor can send too, even though they can't decrypt", async () => {
  const { draft, enc } = await atGuessPhase();
  clientSubmit(draft, enc, "decrypt");
  eq(S().get(draft).submittedDecrypt, enc, "the encryptor was blocked from sending");
});

await it("sending freezes the numbers", async () => {
  const { draft, a, b } = await atGuessPhase();
  clientSetCode(draft, "decrypt", [1, 2, 3]);
  clientSubmit(draft, a, "decrypt");
  clientSetCode(draft, "decrypt", [4, 3, 2]);   // b keeps arguing
  eq(S().get(draft).decrypt, [1, 2, 3], "a sent answer was edited afterwards");
});

await it("a second tap does not overwrite who sent it", async () => {
  const { draft, a, b } = await atGuessPhase();
  clientSubmit(draft, a, "decrypt");
  clientSubmit(draft, b, "decrypt");
  eq(S().get(draft).submittedDecrypt, a, "the first sender should be recorded");
});

await it("round-1 gold half advances when only the owners have sent", async () => {
  // Official: round 1 has no interception, so the opposing team does nothing.
  const { roomId, draft, a } = await atGuessPhase();
  clientSetCode(draft, "decrypt", [1, 2, 3]);
  clientSubmit(draft, a, "decrypt");
  await call(fns.advancePhase, a, { roomId, fromPhase: "guess", fromRound: 1 });
  eq(S().get(`rooms/${roomId}`).phase, "reveal", "did not advance on owner submit");
  eq(S().get(`rooms/${roomId}`).activeTeam, "gold", "wrong half revealed");
});

await it("after gold reveal, silver half opens", async () => {
  const { roomId, draft, a, HOST } = await atGuessPhase();
  clientSetCode(draft, "decrypt", [1, 2, 3]);
  clientSubmit(draft, a, "decrypt");
  await call(fns.advancePhase, a, { roomId, fromPhase: "guess", fromRound: 1 });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "reveal", fromRound: 1 });
  eq(S().get(`rooms/${roomId}`).phase, "guess", "silver half did not open");
  eq(S().get(`rooms/${roomId}`).activeTeam, "silver", "active team should be silver");
});

console.log("\nediting after the deadline");

await it("an edit landing after resolve cannot change the result", async () => {
  const { roomId, draft, HOST, code } = await atGuessPhase();
  clientSetCode(draft, "decrypt", [...code]);   // correct
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "guess", fromRound: 1 });

  const before = S().get(`rooms/${roomId}/rounds/1`).data.gold.decrypt;
  eq(before, code, "the correct answer was recorded");

  // a slow phone flushes a stale edit a moment too late
  clientSetCode(draft, "decrypt", [4, 4, 4]);
  eq(S().get(`rooms/${roomId}/rounds/1`).data.gold.decrypt, code, "the record was rewritten");
  eq(S().get(`rooms/${roomId}`).teams.gold.score.fault, 0, "score changed after the fact");
});

await it("whatever is on screen at the deadline is what counts", async () => {
  const { roomId, draft, HOST, code } = await atGuessPhase();
  clientSetCode(draft, "decrypt", [code[1], code[0], code[2]]);  // mid-argument, wrong
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "guess", fromRound: 1 });
  eq(S().get(`rooms/${roomId}/rounds/1`).data.gold.faulted, true,
     "an unfinished argument should still be graded");
});

await it("a team that never touches the draft takes the fault", async () => {
  const { roomId, HOST } = await atGuessPhase();
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "guess", fromRound: 1 });
  const rec = S().get(`rooms/${roomId}/rounds/1`);
  eq(rec.data.gold.decrypt, [null, null, null], "empty draft");
  eq(rec.data.gold.faulted, true, "silence should count as a wrong answer");
});

console.log("\nthe encryptor under contention");

await it("the draft names the encryptor so the UI can lock them out", async () => {
  // With the engine in the browser there is no server to enforce this,
  // so the guard is the UI: GuessPhase passes onChange={undefined} when
  // you are your own team's encryptor. The draft carries the uid it
  // keys off.
  const { draft, enc } = await atGuessPhase();
  eq(S().get(draft).lockedFor, enc, "the draft does not name the encryptor");
});

await it("the encryptor may still drive the interception", async () => {
  const { draft } = await atGuessPhase();
  clientSetCode(draft, "intercept", [2, 1, 3]);
  eq(S().get(draft).intercept, [2, 1, 3], "interception blocked for the encryptor");
});

console.log("\nguess sheets");

await it("every player starts with an empty sheet", async () => {
  const { roomId, gold } = await atGuessPhase();
  for (const u of gold) {
    const g = S().get(`rooms/${roomId}/guesses/${u}`);
    if (!g) throw new Error(`no sheet for ${u}`);
    eq(g.words, { "1": "", "2": "", "3": "", "4": "" }, "sheet should start blank");
  }
});

await it("a sheet survives the round boundary", async () => {
  const { roomId, HOST, a, draft } = await atGuessPhase();
  S().get(`rooms/${roomId}/guesses/${a}`).words["2"] = "بحر";
  for (const p of ["guess", "reveal", "guess", "reveal", "roundEnd"]) {
    await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: p, fromRound: 1 });
  }
  eq(S().get(`rooms/${roomId}`).round, 2, "should be in round 2");
  eq(S().get(`rooms/${roomId}/guesses/${a}`).words["2"], "بحر",
     "the sheet was wiped between rounds");
});

await it("sheets are scoped to one team", async () => {
  const { roomId, gold } = await atGuessPhase();
  const silver = S().get(`rooms/${roomId}`).teams.silver.members;
  for (const u of gold) eq(S().get(`rooms/${roomId}/guesses/${u}`).members, gold, "gold sheet");
  for (const u of silver) eq(S().get(`rooms/${roomId}/guesses/${u}`).members, silver, "silver sheet");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
