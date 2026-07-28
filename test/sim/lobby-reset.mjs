/**
 * Host "end game → lobby" and rematch must reopen the lobby and wipe
 * round docs even when away-rows exist (the old rules blocked that delete).
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fbs = require("firebase/firestore");
const eng = require("./lib/engine.cjs");
const fns = eng.api;

const call = async (fn, uid, data) => { fbs.__setUser(uid); return fn(data); };
const admin = { __reset: fbs.__reset, __store: fbs.__store };
const S = () => fbs.__store;

let pass = 0, fail = 0;
async function it(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function eq(a, b, m) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m}: got ${A}, want ${B}`);
}
function assert(cond, m) { if (!cond) throw new Error(m); }

async function seededGame() {
  admin.__reset();
  const HOST = "u0";
  const { roomId } = await call(fns.createRoom, HOST, { name: "host", avatar: 0 });
  for (let i = 1; i < 4; i++) {
    await call(fns.joinRoom, `u${i}`, { roomId, name: `p${i}`, avatar: i });
  }
  const uids = ["u0", "u1", "u2", "u3"];
  for (let i = 0; i < uids.length; i++) {
    await call(fns.setTeam, uids[i], { roomId, team: i % 2 === 0 ? "gold" : "silver" });
  }
  await call(fns.startGame, HOST, { roomId });
  await call(fns.advancePhase, HOST, { roomId, force: true, fromPhase: "keys", fromRound: 1 });
  // Simulate an away row — the wipe used to choke on these under real rules.
  S().set(`rooms/${roomId}/away/1_u1`, { uid: "u1", round: 1, count: 1, ms: 4000 });
  return { HOST, roomId };
}

console.log("\nreturn-to-lobby");

await it("host endGame mid-encrypt returns everyone to lobby", async () => {
  const { HOST, roomId } = await seededGame();
  const before = S().get(`rooms/${roomId}`);
  assert(before.phase === "encrypt", `expected encrypt, got ${before.phase}`);
  assert(S().has(`rooms/${roomId}/private/gold`), "private keys missing before wipe");

  await call(fns.hostControl, HOST, { roomId, action: "endGame" });

  const r = S().get(`rooms/${roomId}`);
  eq(r.phase, "lobby", "phase");
  eq(r.round, 0, "round");
  eq(r.winner, null, "winner");
  eq(r.teams.gold.score, { breach: 0, fault: 0 }, "gold score reset");
  assert(r.players.u0 && r.players.u1, "players kept");
  assert(r.players.u0.team === "gold", "teams kept");
  assert(!S().has(`rooms/${roomId}/away/1_u1`), "away wiped");
  assert(!S().has(`rooms/${roomId}/private/gold`), "private wiped");
  assert(!S().has(`rooms/${roomId}/final/keys`), "final wiped");
});

await it("non-host cannot endGame", async () => {
  const { roomId } = await seededGame();
  try {
    await call(fns.hostControl, "u1", { roomId, action: "endGame" });
    throw new Error("expected rejection");
  } catch (e) {
    if (!(e instanceof Error) || /expected rejection/.test(e.message)) throw e;
  }
  eq(S().get(`rooms/${roomId}`).phase, "encrypt", "still encrypt");
});

await it("rematch from over returns to lobby", async () => {
  const { HOST, roomId } = await seededGame();
  // Force an over screen the cheap way.
  S().get(`rooms/${roomId}`).phase = "over";
  S().get(`rooms/${roomId}`).winner = "gold";
  S().get(`rooms/${roomId}`).endReason = "breach";
  await call(fns.rematch, HOST, { roomId });
  eq(S().get(`rooms/${roomId}`).phase, "lobby", "phase");
  eq(S().get(`rooms/${roomId}`).winner, null, "winner cleared");
});

await it("can start again after endGame", async () => {
  const { HOST, roomId } = await seededGame();
  await call(fns.hostControl, HOST, { roomId, action: "endGame" });
  await call(fns.startGame, HOST, { roomId });
  eq(S().get(`rooms/${roomId}`).phase, "keys", "restarted");
  assert(S().has(`rooms/${roomId}/private/gold`), "redealt");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
