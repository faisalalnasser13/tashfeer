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
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["نار", "بحر", "جبل"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["ظل", "قفل", "ريح"] });
  for (const p of ["encrypt", "guess", "reveal", "guess", "reveal", "roundEnd"]) {
    await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: p, fromRound: 1 });
  }
  eq(room(roomId).round, 2, "did not reach round 2");
  await throws(
    () => call(fns.submitClues, room(roomId).encryptor.gold, { roomId, clues: ["نار", "ققق", "ففف"] }),
    "جولة سابقة"
  );
});

await it("normalisation catches a respelled repeat", async () => {
  const { roomId, HOST } = await freshGame();
  const r = room(roomId);
  await call(fns.submitClues, r.encryptor.gold, { roomId, clues: ["الأسد", "بحر", "جبل"] });
  await call(fns.submitClues, r.encryptor.silver, { roomId, clues: ["ظل", "قفل", "ريح"] });
  for (const p of ["encrypt", "guess", "reveal", "guess", "reveal", "roundEnd"]) {
    await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: p, fromRound: 1 });
  }
  // same word, alif hamza dropped
  await throws(
    () => call(fns.submitClues, room(roomId).encryptor.gold, { roomId, clues: ["الاسد", "x", "y"] }),
    "جولة سابقة"
  );
});

await it("the three clues in one round must differ", async () => {
  const { roomId } = await freshGame();
  await throws(
    () => call(fns.submitClues, room(roomId).encryptor.gold, { roomId, clues: ["نار", "نار", "بحر"] }),
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
