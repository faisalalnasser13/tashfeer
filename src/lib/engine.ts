/**
 * The game engine, running in the browser.
 *
 * This is a port of what used to be Cloud Functions. It keeps the exact
 * same call signatures, so no screen had to change — only the transport.
 *
 * Two things survive the move and matter:
 *
 *  1. Every state change is a Firestore transaction with an idempotency
 *     guard. Four phones can race to end the same phase; the first wins
 *     and the rest become no-ops. Without this the round would score
 *     twice.
 *  2. Reads must all precede writes inside a transaction, exactly as on
 *     the server.
 *
 * What we gave up: the dealer is now a player's browser. The host's
 * device picks all eight keywords, and each round's encryptor draws
 * their own code. Nothing is shown to the wrong person, but a
 * determined host could read the opposing team's words out of devtools
 * during the deal. That is a deliberate trade for staying on the free
 * plan — see SETUP.md.
 */

import {
  doc, collection, getDoc, getDocs, deleteDoc, setDoc, runTransaction,
  arrayUnion, arrayRemove, deleteField, writeBatch, updateDoc, serverTimestamp,
  Transaction, DocumentReference,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import {
  TeamId, TEAMS, OTHER, HALF_ORDER, Phase, Room, Settings, RoundRecord,
  allCodes, shuffle, codesEqual, evaluate, scoreShowdown, encodeCode, decodeCode,
} from "./rules";
import { normalizeKeyword, normalizeText } from "./arabic";
import { dealWords } from "./words";
import { S, asLang } from "./strings";
import type { Lang } from "./types";

/* ------------------------------------------------------------------ */
/* plumbing                                                           */
/* ------------------------------------------------------------------ */

const ID_ALPHABET = "0123456789";
/** Small skew so a slightly-fast phone isn't rejected at the true deadline. */
const CLOCK_SKEW_MS = 250;

/**
 * local − server. Positive means this phone's clock is ahead.
 * Updated from room.serverNow on each committed snapshot.
 */
let clockOffsetMs = 0;

export function noteServerNow(raw: unknown): void {
  if (raw == null) return;
  let ms: number | null = null;
  if (typeof raw === "number" && Number.isFinite(raw)) ms = raw;
  else if (typeof raw === "object" && raw !== null && "toMillis" in raw) {
    const n = (raw as { toMillis: () => number }).toMillis();
    if (Number.isFinite(n)) ms = n;
  }
  if (ms == null) return;
  clockOffsetMs = Date.now() - ms;
}

/** Wall time in the same domain as phaseEndsAt (Firestore server clock). */
export function syncedNow(): number {
  return Date.now() - clockOffsetMs;
}

function clockStamp() {
  return { serverNow: serverTimestamp() };
}

/**
 * Hidden cushion after the visible timer hits 0:00. Not baked into
 * `phaseEndsAt` — the clock shows the real budget, then this grace runs
 * silently before the phase advances.
 */
export const TIMER_GRACE_MS = 2500;
/**
 * Lead-in before the visible encrypt/guess clock starts draining —
 * covers network/snapshot lag after a phase flip.
 */
export const TIMER_START_GRACE_MS = 1000;
const TIMER_OPTIONS = [45, 60, 75] as const;

export const DEFAULTS: Settings = {
  encryptSecs: 60,
  guessSecs: 60,
  maxRounds: 8,
  useTimer: true,
};

function snapTimer(n: number): number {
  let best: number = TIMER_OPTIONS[1];
  let dist = Infinity;
  for (const opt of TIMER_OPTIONS) {
    const d = Math.abs(opt - n);
    if (d < dist) { best = opt; dist = d; }
  }
  return best;
}

/** Mirrors HttpsError so the screens' error handling is unchanged. */
export class GameError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const roomRef = (id: string) => doc(db, "rooms", id);
const privateRef = (id: string, t: TeamId) => doc(db, "rooms", id, "private", t);
const secretRef = (id: string, t: TeamId, r: number) =>
  doc(db, "rooms", id, "secret", `${t}_r${r}`);
const deckRef = (id: string, t: TeamId) => doc(db, "rooms", id, "secret", `deck_${t}`);
const draftRef = (id: string, t: TeamId, r: number) =>
  doc(db, "rooms", id, "drafts", `${t}_r${r}`);
const guessRef = (id: string, uid: string) => doc(db, "rooms", id, "guesses", uid);

function asRoom(id: string, raw: Record<string, unknown>): Room {
  return { ...(raw as unknown as Room), id, lang: asLang(raw.lang) };
}

function me(lang: Lang = "ar"): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new GameError("unauthenticated", S(lang).err.signIn);
  return uid;
}

async function loadRoom(id: string): Promise<Room> {
  const snap = await getDoc(roomRef(id));
  if (!snap.exists()) throw new GameError("not-found", S("ar").err.noSuchRoom);
  return asRoom(id, snap.data() as Record<string, unknown>);
}

function requireHost(room: Room, uid: string) {
  if (room.hostUid !== uid) {
    throw new GameError("permission-denied", S(room.lang).err.hostOnly);
  }
}

function newRoomId(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return s;
}

function membersOf(room: Room, team: TeamId): string[] {
  return Object.entries(room.players)
    .filter(([, p]) => p.team === team)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([uid]) => uid);
}

/** Prefer the smaller side; on a tie, stable pick from uid (txn-safe). */
function pickBalancedTeam(goldN: number, silverN: number, uid: string, lang: Lang = "ar"): TeamId {
  if (goldN >= 4 && silverN >= 4) {
    throw new GameError("resource-exhausted", S(lang).err.teamsFull);
  }
  if (goldN >= 4) return "silver";
  if (silverN >= 4) return "gold";
  if (goldN < silverN) return "gold";
  if (silverN < goldN) return "silver";
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h + uid.charCodeAt(i) * (i + 1)) % 2;
  return h === 0 ? "gold" : "silver";
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function isTimedPlayPhase(phase: Phase): boolean {
  return phase === "encrypt" || phase === "guess" || phase === "showdown";
}

function phaseDuration(settings: Settings, phase: Phase): number | null {
  // Keys / reveal / roundEnd: host-driven only (no auto clock).
  if (phase === "keys" || phase === "reveal" || phase === "roundEnd") return null;
  if (!settings.useTimer) return null;
  if (phase === "encrypt") return settings.encryptSecs * 1000;
  if (phase === "guess" || phase === "showdown") return settings.guessSecs * 1000;
  return null;
}

/** Grace only on the timed play phases — not on 2s transition beats. */
function phaseGraceMs(phase: Phase): number {
  return isTimedPlayPhase(phase) ? TIMER_GRACE_MS : 0;
}

function phasePatch(settings: Settings, phase: Phase) {
  const now = syncedNow();
  const dur = phaseDuration(settings, phase);
  const startGrace =
    dur != null && isTimedPlayPhase(phase)
      ? TIMER_START_GRACE_MS
      : 0;
  return {
    phase,
    phaseStartedAt: now,
    // Visible 0:00. A hidden TIMER_GRACE_MS follows before advance.
    // Timed play phases also get TIMER_START_GRACE_MS before the clock drains.
    phaseEndsAt: dur === null ? null : now + startGrace + dur,
    updatedAt: now,
    ...clockStamp(),
  };
}

function wordsRecord(src: Record<string, string> | undefined): Record<string, string> {
  return {
    "1": String(src?.["1"] ?? "").slice(0, 24),
    "2": String(src?.["2"] ?? "").slice(0, 24),
    "3": String(src?.["3"] ?? "").slice(0, 24),
    "4": String(src?.["4"] ?? "").slice(0, 24),
  };
}

function wordsToArr(words: Record<string, string> | undefined): string[] {
  const w = wordsRecord(words);
  return [w["1"], w["2"], w["3"], w["4"]];
}

function emptySubmitMs(): Record<TeamId, number> {
  return { gold: 0, silver: 0 };
}

/** Patch room fields when someone leaves a seated team mid-game. */
function applyMemberRemoval(
  r: Room,
  target: string,
  team: TeamId,
  patch: Record<string, unknown>,
): string[] {
  const members = r.teams[team].members;
  if (!members.includes(target)) return members;
  const nextMembers = members.filter((u) => u !== target);
  patch[`teams.${team}.members`] = nextMembers;

  if (r.phase !== "lobby" && r.phase !== "over") {
    if (nextMembers.length === 0) {
      patch[`encryptor.${team}`] = "";
      patch[`teams.${team}.encryptorIdx`] = 0;
    } else if (r.encryptor[team] === target) {
      const oldIdx = members.indexOf(target);
      const newIdx = oldIdx < nextMembers.length ? oldIdx : 0;
      patch[`encryptor.${team}`] = nextMembers[newIdx];
      patch[`teams.${team}.encryptorIdx`] = newIdx;
    } else {
      const encUid = r.encryptor[team] || "";
      const encIdx = nextMembers.indexOf(encUid);
      if (encIdx >= 0) patch[`teams.${team}.encryptorIdx`] = encIdx;
    }
  }
  return nextMembers;
}

/**
 * Keep private / deck / guesses membership in sync with the room.
 * Mid-game joiners need a guesses/{uid} sheet or showdown hard-locks.
 */
async function syncTeamSideDocs(
  roomId: string,
  team: TeamId,
  uid: string,
  action: "add" | "remove",
  teamMembers: string[],
) {
  const jobs: Promise<unknown>[] = [
    updateDoc(privateRef(roomId, team), {
      members: action === "add" ? arrayUnion(uid) : arrayRemove(uid),
    }).catch(() => {}),
    updateDoc(deckRef(roomId, team), {
      members: action === "add" ? arrayUnion(uid) : arrayRemove(uid),
    }).catch(() => {}),
  ];

  if (action === "add") {
    const members = teamMembers.includes(uid) ? teamMembers : [...teamMembers, uid];
    jobs.push(
      setDoc(guessRef(roomId, uid), {
        uid,
        team,
        members,
        words: { "1": "", "2": "", "3": "", "4": "" },
      }, { merge: true }).catch(() => {}),
    );
    for (const u of members) {
      if (u === uid) continue;
      jobs.push(
        updateDoc(guessRef(roomId, u), { members: arrayUnion(uid) }).catch(() => {}),
      );
    }
  } else {
    jobs.push(deleteDoc(guessRef(roomId, uid)).catch(() => {}));
    for (const u of teamMembers) {
      jobs.push(
        updateDoc(guessRef(roomId, u), { members: arrayRemove(uid) }).catch(() => {}),
      );
    }
  }

  await Promise.all(jobs);
}

/* ------------------------------------------------------------------ */
/* lobby                                                              */
/* ------------------------------------------------------------------ */

async function createRoom({ name, avatar, lang }: { name: string; avatar: number; lang?: Lang }) {
  const L = asLang(lang);
  const uid = me(L);
  const clean = String(name || "").trim().slice(0, 16);
  if (!clean) throw new GameError("invalid-argument", S(L).err.writeName);

  for (let attempt = 0; attempt < 6; attempt++) {
    const id = newRoomId();
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef(id));
      if (snap.exists()) return false;
      const now = syncedNow();
      tx.set(roomRef(id), {
        hostUid: uid,
        lang: L,
        phase: "lobby",
        round: 0,
        showdown: false,
        paused: false,
        phaseStartedAt: now,
        phaseEndsAt: null,
        ...clockStamp(),
        settings: { ...DEFAULTS },
        players: { [uid]: { name: clean, avatar: Number(avatar) || 0, team: null, joinedAt: now } },
        teams: {
          gold: { score: { breach: 0, fault: 0 }, members: [], encryptorIdx: 0 },
          silver: { score: { breach: 0, fault: 0 }, members: [], encryptorIdx: 0 },
        },
        clues: { gold: null, silver: null },
        cluesIn: { gold: false, silver: false },
        showdownIn: { gold: false, silver: false },
        submitMs: emptySubmitMs(),
        encryptor: { gold: null, silver: null },
        activeTeam: null,
        winner: null,
        endReason: null,
        showdownHits: null,
        showdownGuesses: null,
        showdownTimeBreak: false,
        createdAt: now,
        updatedAt: now,
      });
      return true;
    });
    if (created) return { roomId: id };
  }
  throw new GameError("internal", S(L).err.createFailed);
}

async function joinRoom({ roomId, name, avatar }: { roomId: string; name: string; avatar: number }) {
  const uid = me();
  const id = String(roomId || "").replace(/\D/g, "").slice(0, 4);
  const clean = String(name || "").trim().slice(0, 16);
  if (!clean) throw new GameError("invalid-argument", S("ar").err.writeName);

  const assigned = await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(id));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.noSuchRoom);
    const room = asRoom(id, snap.data() as Record<string, unknown>);
    const existing = room.players[uid];
    const now = Date.now();

    if (existing) {
      // Re-entry / rename — keep seat. If somehow team-less mid-game, seat them.
      let team = existing.team;
      const patch: Record<string, unknown> = {
        [`players.${uid}`]: {
          ...existing,
          name: clean,
          avatar: Number(avatar) || 0,
        },
        updatedAt: now,
      };
      let seated: TeamId | null = null;
      if (!team && room.phase !== "lobby") {
        team = pickBalancedTeam(
          room.teams.gold.members.length,
          room.teams.silver.members.length,
          uid,
          room.lang,
        );
        patch[`players.${uid}`] = {
          ...existing,
          name: clean,
          avatar: Number(avatar) || 0,
          team,
        };
        patch[`teams.${team}.members`] = arrayUnion(uid);
        seated = team;
      }
      tx.update(roomRef(id), patch);
      return seated;
    }

    if (Object.keys(room.players).length >= 10) {
      throw new GameError("resource-exhausted", S(room.lang).err.roomFull);
    }

    // Lobby: sit unassigned until they pick a side.
    if (room.phase === "lobby") {
      tx.update(roomRef(id), {
        [`players.${uid}`]: {
          name: clean, avatar: Number(avatar) || 0, team: null, joinedAt: now,
        },
        updatedAt: now,
      });
      return null;
    }

    // Mid-game (and post-game over): auto-seat on the shorter team.
    const team = pickBalancedTeam(
      room.teams.gold.members.length,
      room.teams.silver.members.length,
      uid,
      room.lang,
    );
    tx.update(roomRef(id), {
      [`players.${uid}`]: {
        name: clean, avatar: Number(avatar) || 0, team, joinedAt: now,
      },
      [`teams.${team}.members`]: arrayUnion(uid),
      updatedAt: now,
    });
    return team;
  });

  // Patch private/deck/guesses after the room write so rules see our team.
  if (assigned) {
    const after = await loadRoom(id).catch(() => null);
    const members = after ? after.teams[assigned].members : [uid];
    await syncTeamSideDocs(id, assigned, uid, "add", members);
  }

  return { roomId: id };
}

async function setTeam({ roomId, team }: { roomId: string; team: string | null }) {
  const uid = me();
  const room = await loadRoom(roomId);
  if (team !== null && team !== "gold" && team !== "silver") {
    throw new GameError("invalid-argument", S(room.lang).err.unknownTeam);
  }
  if (room.phase !== "lobby") {
    throw new GameError("failed-precondition", S(room.lang).err.switchPlay);
  }
  if (!room.players[uid]) throw new GameError("permission-denied", S(room.lang).err.notInRoom);
  await runTransaction(db, async (tx) => {
    tx.update(roomRef(roomId), { [`players.${uid}.team`]: team, updatedAt: Date.now() });
  });
  return { ok: true };
}

async function shuffleTeams({ roomId }: { roomId: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "lobby") throw new GameError("failed-precondition", S(room.lang).err.shuffleLobby);

  const players = shuffle(Object.keys(room.players));
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  players.forEach((u, i) => { patch[`players.${u}.team`] = i % 2 === 0 ? "gold" : "silver"; });
  await runTransaction(db, async (tx) => { tx.update(roomRef(roomId), patch); });
  return { ok: true };
}

async function kickPlayer({ roomId, uid: target }: { roomId: string; uid: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (target === uid) throw new GameError("invalid-argument", S(room.lang).err.kickSelf);
  if (!room.players[target]) throw new GameError("not-found", S(room.lang).err.playerGone);
  if (room.phase === "over") {
    throw new GameError("failed-precondition", S(room.lang).err.gameOver);
  }

  let removedFrom: TeamId | null = null;
  let remainingMembers: string[] = [];

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) return;
    const r = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (r.hostUid !== uid) {
      throw new GameError("permission-denied", S(r.lang).err.hostKick);
    }
    if (!r.players[target]) return;

    const patch: Record<string, unknown> = {
      [`players.${target}`]: deleteField(),
      updatedAt: Date.now(),
    };

    const team =
      TEAMS.find((t) => r.teams[t].members.includes(target)) ??
      r.players[target].team;

    if (team) {
      removedFrom = team;
      remainingMembers = applyMemberRemoval(r, target, team, patch);
    }

    tx.update(roomRef(roomId), patch);
  });

  if (removedFrom && room.phase !== "lobby") {
    await syncTeamSideDocs(roomId, removedFrom, target, "remove", remainingMembers);
  }

  return { ok: true };
}

async function leaveRoom({ roomId }: { roomId: string }) {
  const uid = me();
  let removedFrom: TeamId | null = null;
  let remainingMembers: string[] = [];
  let phase: Phase | null = null;
  let roomGone = false;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) return;
    const room = snap.data() as Room;
    phase = room.phase;
    const remaining = Object.keys(room.players).filter((u) => u !== uid);
    if (remaining.length === 0) {
      roomGone = true;
      tx.delete(roomRef(roomId));
      return;
    }
    const patch: Record<string, unknown> = {
      [`players.${uid}`]: deleteField(),
      updatedAt: Date.now(),
    };

    const team =
      TEAMS.find((t) => room.teams[t].members.includes(uid)) ??
      room.players[uid]?.team ??
      null;
    if (team) {
      removedFrom = team;
      remainingMembers = applyMemberRemoval(room, uid, team, patch);
    }

    if (room.hostUid === uid) {
      remaining.sort((a, b) => room.players[a].joinedAt - room.players[b].joinedAt);
      patch.hostUid = remaining[0];
    }
    tx.update(roomRef(roomId), patch);
  });

  if (!roomGone && removedFrom && phase && phase !== "lobby") {
    await syncTeamSideDocs(roomId, removedFrom, uid, "remove", remainingMembers);
  }

  return { ok: true };
}

async function updateSettings({ roomId, settings }: { roomId: string; settings: Partial<Settings> }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "lobby") throw new GameError("failed-precondition", S(room.lang).err.settingsLobby);
  const s = settings ?? {};
  const next: Settings = {
    encryptSecs: snapTimer(Number(s.encryptSecs ?? room.settings.encryptSecs)),
    guessSecs: snapTimer(Number(s.guessSecs ?? room.settings.guessSecs)),
    maxRounds: clamp(Number(s.maxRounds ?? room.settings.maxRounds), 4, 12),
    useTimer: Boolean(s.useTimer ?? room.settings.useTimer),
  };
  await runTransaction(db, async (tx) => {
    tx.update(roomRef(roomId), { settings: next, updatedAt: Date.now() });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* start                                                              */
/* ------------------------------------------------------------------ */

async function startGame({ roomId }: { roomId: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "lobby") throw new GameError("failed-precondition", S(room.lang).err.gameStarted);

  const gold = membersOf(room, "gold");
  const silver = membersOf(room, "silver");
  if (gold.length < 2 || silver.length < 2) {
    throw new GameError("failed-precondition", S(room.lang).err.needTwo);
  }

  const words = dealWords(8, room.lang);
  const batch = writeBatch(db);
  const finalKeys: Record<string, string[]> = {};

  for (const team of TEAMS) {
    const members = team === "gold" ? gold : silver;
    const keys = team === "gold" ? words.slice(0, 4) : words.slice(4, 8);
    batch.set(privateRef(roomId, team), {
      team, keys, members, usedClues: [],
      // Shared opponent-word theories — one sheet for the whole team.
      theories: { "1": "", "2": "", "3": "", "4": "" },
    });
    finalKeys[team] = keys;
    batch.set(deckRef(roomId, team), {
      team,
      members,
      // Firestore forbids nested arrays — pack each [a,b,c] as "abc".
      deck: shuffle(allCodes()).map(encodeCode),
    });
    for (const u of members) {
      batch.set(guessRef(roomId, u), {
        uid: u, team, members, words: { "1": "", "2": "", "3": "", "4": "" },
      });
    }
  }

  // Sealed until the final screen; rules refuse to serve it before then.
  batch.set(doc(db, "rooms", roomId, "final", "keys"), finalKeys);

  batch.update(roomRef(roomId), {
    ...phasePatch(room.settings, "keys"),
    round: 1,
    showdown: false,
    winner: null,
    endReason: null,
    clues: { gold: null, silver: null },
    cluesIn: { gold: false, silver: false },
    showdownIn: { gold: false, silver: false },
    submitMs: emptySubmitMs(),
    showdownHits: null,
    showdownGuesses: null,
    showdownTimeBreak: false,
    encryptor: { gold: gold[0], silver: silver[0] },
    activeTeam: null,
    "teams.gold.members": gold,
    "teams.silver.members": silver,
    "teams.gold.encryptorIdx": 0,
    "teams.silver.encryptorIdx": 0,
    "teams.gold.score": { breach: 0, fault: 0 },
    "teams.silver.score": { breach: 0, fault: 0 },
  });

  await batch.commit();
  return { ok: true };
}

/**
 * Host-only, keys phase only. Draws four fresh words from the bank for
 * one team. Teams are independent — no exclusion of the other side, no
 * reordering of the current four. Codes/decks stay valid (digit slots).
 * Updates `final/keys` without reading it (sealed until game over).
 */
async function shuffleTeamKeys({ roomId, team }: { roomId: string; team: string }) {
  const uid = me();
  if (team !== "gold" && team !== "silver") {
    throw new GameError("invalid-argument", S("ar").err.unknownTeam);
  }
  const side = team as TeamId;
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "keys") {
    throw new GameError("failed-precondition", S(room.lang).err.shuffleKeysPhase);
  }

  const fresh = dealWords(4, room.lang);

  await runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef(roomId));
    if (!roomSnap.exists()) throw new GameError("not-found", S(room.lang).err.roomMissing);
    const cur = asRoom(roomId, roomSnap.data() as Record<string, unknown>);
    if (cur.phase !== "keys") return;

    tx.update(privateRef(roomId, side), { keys: fresh });
    tx.update(doc(db, "rooms", roomId, "final", "keys"), { [side]: fresh });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* codes — drawn by the encryptor's own device                        */
/* ------------------------------------------------------------------ */

/**
 * Called by the encryptor's client when it needs a code and doesn't
 * have one. Keeping this on the encryptor's device means no other
 * player's browser ever holds it — including the host's.
 */
export async function ensureCode(roomId: string, team: TeamId, round: number) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(secretRef(roomId, team, round));
    const deckSnap = await tx.get(deckRef(roomId, team));
    const prev = existing.data() as { code?: number[]; clues?: string[] } | undefined;
    if (prev?.code && prev.code.length === 3) return;

    const raw = (deckSnap.data()?.deck as (string | number[])[]) || [];
    let deck = raw.length > 0 ? raw.map(decodeCode) : shuffle(allCodes());
    if (deck.length === 0) deck = shuffle(allCodes());

    tx.set(deckRef(roomId, team), {
      team,
      members: deckSnap.data()?.members ?? [],
      deck: deck.slice(1).map(encodeCode),
    });
    tx.set(secretRef(roomId, team, round), {
      team,
      round,
      code: deck[0],
      encryptorUid: uid,
      ...(prev?.clues ? { clues: prev.clues } : {}),
    });
  });
}

/* ------------------------------------------------------------------ */
/* clues                                                              */
/* ------------------------------------------------------------------ */

async function submitClues({ roomId, clues: raw }: { roomId: string; clues: string[] }) {
  const uid = me();
  const room = await loadRoom(roomId);
  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new GameError("invalid-argument", S(room.lang).err.writeThree);
  }
  const clues = raw.map((c) => String(c || "").trim().slice(0, 40));
  if (clues.some((c) => !c)) throw new GameError("invalid-argument", S(room.lang).err.emptyClue);

  if (room.phase !== "encrypt") throw new GameError("failed-precondition", S(room.lang).err.notEncryptPhase);

  const team = TEAMS.find((t) => room.encryptor[t] === uid) ?? null;
  if (!team) throw new GameError("permission-denied", S(room.lang).err.notEncryptor);

  const privSnap = await getDoc(privateRef(roomId, team));
  const priv = privSnap.data() as { keys: string[]; usedClues: string[] } | undefined;
  if (!priv) throw new GameError("internal", S(room.lang).err.noTeamData);

  const normClues = clues.map((c) => normalizeKeyword(c, room.lang));
  const normKeys = priv.keys.map((k) => normalizeKeyword(k, room.lang));
  for (let i = 0; i < 3; i++) {
    if (normKeys.includes(normClues[i])) {
      throw new GameError("invalid-argument", S(room.lang).err.clueIsKeyword(i + 1));
    }
  }
  if (new Set(normClues).size !== 3) {
    throw new GameError("invalid-argument", S(room.lang).err.cluesDup);
  }
  const used = new Set((priv.usedClues || []).map((c) => normalizeText(c, room.lang)));
  for (const c of clues) {
    if (used.has(normalizeText(c, room.lang))) {
      throw new GameError("invalid-argument", S(room.lang).err.clueUsed(c));
    }
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S(room.lang).err.roomMissing);
    const cur = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (cur.phase !== "encrypt") return;
    if (cur.cluesIn[team]) return;

    const now = syncedNow();
    const elapsed = Math.max(0, now - (cur.phaseStartedAt ?? now));
    const prevMs = cur.submitMs?.[team] ?? 0;

    tx.update(secretRef(roomId, team, cur.round), { clues });
    tx.update(privateRef(roomId, team), {
      usedClues: arrayUnion(...clues.map((c) => normalizeText(c, cur.lang))),
    });
    tx.update(roomRef(roomId), {
      [`cluesIn.${team}`]: true,
      [`submitMs.${team}`]: prevMs + elapsed,
      updatedAt: now,
    });
  });
  return { ok: true };
}

/**
 * Lock in this team's four guesses about the opponent's keywords.
 * Prefill lives on guesses/{uid}; the first teammate to send wins the flag.
 */
async function submitShowdown({
  roomId, words: raw,
}: { roomId: string; words: string[] | Record<string, string> }) {
  const uid = me();
  const room = await loadRoom(roomId);
  const team = room.players[uid]?.team;
  if (!team) throw new GameError("permission-denied", S(room.lang).err.notOnTeam);

  const asRecord = Array.isArray(raw)
    ? { "1": raw[0] ?? "", "2": raw[1] ?? "", "3": raw[2] ?? "", "4": raw[3] ?? "" }
    : raw;
  const words = wordsRecord(asRecord);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S(room.lang).err.roomMissing);
    const cur = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (cur.phase !== "showdown") return;
    if (cur.showdownIn?.[team]) return;

    const now = Date.now();
    const members = cur.teams[team].members;
    for (const u of members) {
      tx.set(guessRef(roomId, u), {
        uid: u, team, members, words, submittedAt: now,
      }, { merge: true });
    }
    tx.update(roomRef(roomId), {
      [`showdownIn.${team}`]: true,
      [`showdownGuesses.${team}`]: wordsToArr(words),
      updatedAt: now,
    });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* phase machine                                                      */
/* ------------------------------------------------------------------ */

/**
 * Any client may call this. The transaction re-reads the room and bails
 * if someone else already advanced, so four phones racing produces one
 * transition, not four.
 */
async function advancePhase({
  roomId, force, fromPhase, fromRound,
}: { roomId: string; force?: boolean; fromPhase?: string; fromRound?: number }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw new GameError("not-found", S("ar").err.roomMissing);
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);

    if (!room.players[uid]) throw new GameError("permission-denied", S(room.lang).err.notInRoom);
    if (room.paused) return;
    if (fromPhase && (room.phase !== fromPhase || room.round !== fromRound)) return;

    const expired =
      room.phaseEndsAt !== null
      && syncedNow() + CLOCK_SKEW_MS >= room.phaseEndsAt + phaseGraceMs(room.phase);

    if (!expired) {
      if (force) requireHost(room, uid);
      else if (!(await everyoneReady(tx, room))) {
        throw new GameError("failed-precondition", S(room.lang).err.timeLeft);
      }
    }
    await runTransition(tx, room);
  });
  // Keys stay sealed until phase == 'over'. Score in a follow-up now
  // that the flip has committed — same call, one user-visible action.
  await settleShowdown(roomId);
  return { ok: true };
}

function cluesFromSecret(data: { clues?: string[] } | undefined): string[] {
  return data?.clues && data.clues.length === 3 ? data.clues : [];
}

function emptyRoundSide() {
  return {
    encryptorUid: null as string | null,
    clues: [] as string[],
    code: [0, 0, 0],
    decrypt: [null, null, null] as (number | null)[],
    intercept: [null, null, null] as (number | null)[],
    noClues: false,
    faulted: false,
    wasBreached: false,
  };
}

/** Grade one team's code. Silent encryptor → fault, never an interception. */
function gradeSide(
  round: number,
  team: TeamId,
  code: number[],
  encUid: string | null,
  clues: string[],
  decrypt: (number | null)[],
  intercept: (number | null)[],
) {
  const noClues = clues.length !== 3;
  const faulted = noClues || !codesEqual(decrypt, code);
  const wasBreached = !noClues && round >= 2 && codesEqual(intercept, code);
  return {
    side: {
      encryptorUid: encUid,
      clues: noClues ? [] : clues,
      code,
      decrypt: noClues ? [null, null, null] as (number | null)[] : decrypt,
      intercept: noClues ? [null, null, null] as (number | null)[] : intercept,
      noClues,
      faulted,
      wasBreached,
    },
    team,
    faulted,
    wasBreached,
  };
}

type DraftPrev = {
  decrypt?: (number | null)[];
  intercept?: (number | null)[];
  submittedDecrypt?: string | null;
  submittedIntercept?: string | null;
  submittedDecryptAt?: number | null;
  submittedInterceptAt?: number | null;
};

type GradedSide = ReturnType<typeof gradeSide>;

/** Nothing left to wait for: both clue sets in, or the active half is done. */
async function everyoneReady(tx: Transaction, room: Room): Promise<boolean> {
  if (room.phase === "encrypt") {
    return room.cluesIn.gold === true && room.cluesIn.silver === true;
  }
  if (room.phase === "showdown") {
    return room.showdownIn?.gold === true && room.showdownIn?.silver === true;
  }
  if (room.phase === "guess") {
    // Round 1: both teams decrypt at once (no interception).
    if (room.round < 2) {
      for (const t of TEAMS) {
        const clues = room.clues[t];
        if (!clues || clues.length !== 3) continue; // silent → nothing to guess
        const owner = await tx.get(draftRef(room.id, t, room.round));
        if (!owner.data()?.submittedDecrypt) return false;
      }
      return true;
    }
    const active = room.activeTeam ?? "gold";
    const opp = OTHER[active];
    const owner = await tx.get(draftRef(room.id, active, room.round));
    if (!owner.data()?.submittedDecrypt) return false;
    const interceptor = await tx.get(draftRef(room.id, opp, room.round));
    return Boolean(interceptor.data()?.submittedIntercept);
  }
  return false;
}

/**
 * Round 1: both teams decrypt their own codes at once — no interception.
 * If neither encryptor wrote clues, skip straight to a dual reveal.
 */
async function beginRound1Guess(tx: Transaction, room: Room): Promise<void> {
  const id = room.id;
  const round = room.round;

  const secretSnaps = {
    gold: await tx.get(secretRef(id, "gold", round)),
    silver: await tx.get(secretRef(id, "silver", round)),
  };
  const draftSnaps = {
    gold: await tx.get(draftRef(id, "gold", round)),
    silver: await tx.get(draftRef(id, "silver", round)),
  };
  const prevRec = await tx.get(doc(db, "rooms", id, "rounds", String(round)));

  const published: Record<TeamId, string[]> = {
    gold: cluesFromSecret(secretSnaps.gold.data() as { clues?: string[] } | undefined),
    silver: cluesFromSecret(secretSnaps.silver.data() as { clues?: string[] } | undefined),
  };
  const anyClues = TEAMS.some((t) => published[t].length === 3);

  if (!anyClues) {
    applyResolvedSides(tx, room, {
      gold: gradeSide(
        round, "gold",
        (secretSnaps.gold.data()?.code as number[]) || [0, 0, 0],
        (secretSnaps.gold.data()?.encryptorUid as string) ?? null,
        published.gold, [null, null, null], [null, null, null],
      ),
      silver: gradeSide(
        round, "silver",
        (secretSnaps.silver.data()?.code as number[]) || [0, 0, 0],
        (secretSnaps.silver.data()?.encryptorUid as string) ?? null,
        published.silver, [null, null, null], [null, null, null],
      ),
    }, prevRec.data() as RoundRecord | undefined, /* bothDone */ true, /* activeReveal */ null);
    return;
  }

  for (const team of TEAMS) {
    const prev = draftSnaps[team].data() as DraftPrev | undefined;
    const has = published[team].length === 3;
    tx.set(draftRef(id, team, round), {
      team,
      round,
      members: room.teams[team].members,
      lockedFor: room.encryptor[team] ?? null,
      decrypt: has ? [null, null, null] : (prev?.decrypt ?? [null, null, null]),
      intercept: [null, null, null],
      submittedDecrypt: has ? null : (prev?.submittedDecrypt ?? null),
      submittedIntercept: null,
    });
  }

  tx.update(roomRef(id), {
    ...phasePatch(room.settings, "guess"),
    activeTeam: null, // both teams
    clues: published,
  });
}

/**
 * Open `active`'s half, or — if their encryptor was silent — skip guess
 * and intercept entirely, score a miscommunication fault, and reveal.
 */
async function beginHalfOrSkipSilent(
  tx: Transaction, room: Room, active: TeamId,
): Promise<void> {
  const id = room.id;
  const round = room.round;

  const secretSnaps = {
    gold: await tx.get(secretRef(id, "gold", round)),
    silver: await tx.get(secretRef(id, "silver", round)),
  };
  const draftSnaps = {
    gold: await tx.get(draftRef(id, "gold", round)),
    silver: await tx.get(draftRef(id, "silver", round)),
  };
  const prevRec = await tx.get(doc(db, "rooms", id, "rounds", String(round)));

  const published: Record<TeamId, string[] | null> = {
    gold: room.clues.gold,
    silver: room.clues.silver,
  };
  for (const t of TEAMS) {
    if (t === active || HALF_ORDER.indexOf(t) < HALF_ORDER.indexOf(active)) {
      published[t] = cluesFromSecret(secretSnaps[t].data() as { clues?: string[] } | undefined);
    }
  }

  const activeClues = published[active] ?? [];
  if (activeClues.length !== 3) {
    const secret = secretSnaps[active].data() as {
      code?: number[]; encryptorUid?: string;
    } | undefined;
    const graded = gradeSide(
      round, active,
      secret?.code || [0, 0, 0],
      secret?.encryptorUid ?? null,
      activeClues, [null, null, null], [null, null, null],
    );
    applyResolvedSides(
      tx, { ...room, clues: published },
      { [active]: graded },
      prevRec.data() as RoundRecord | undefined,
      active === "silver",
      active,
    );
    return;
  }

  for (const team of TEAMS) {
    const prev = draftSnaps[team].data() as DraftPrev | undefined;
    tx.set(draftRef(id, team, round), {
      team,
      round,
      members: room.teams[team].members,
      lockedFor: room.encryptor[team] ?? null,
      decrypt: team === active ? [null, null, null] : (prev?.decrypt ?? [null, null, null]),
      intercept: team === OTHER[active]
        ? [null, null, null]
        : (prev?.intercept ?? [null, null, null]),
      submittedDecrypt: team === active ? null : (prev?.submittedDecrypt ?? null),
      submittedIntercept: team === OTHER[active] ? null : (prev?.submittedIntercept ?? null),
    });
  }

  tx.update(roomRef(id), {
    ...phasePatch(room.settings, "guess"),
    activeTeam: active,
    clues: published,
  });
}

async function runTransition(tx: Transaction, room: Room): Promise<void> {
  const id = room.id;

  switch (room.phase) {
    case "keys": {
      tx.update(roomRef(id), { ...phasePatch(room.settings, "encrypt"), activeTeam: null });
      return;
    }

    case "encrypt": {
      if (room.round < 2) {
        await beginRound1Guess(tx, room);
      } else {
        await beginHalfOrSkipSilent(tx, room, "gold");
      }
      return;
    }

    case "guess": {
      if (room.round < 2) {
        await resolveRound1(tx, room);
      } else {
        await resolveHalf(tx, room);
      }
      return;
    }

    case "reveal": {
      // Round-1 dual reveal, or silver half done → round end (or game over).
      if (room.activeTeam == null || room.activeTeam === "silver") {
        if (room.winner) {
          // Skip the "next encryptors" beat — go straight to the final screen.
          tx.update(roomRef(id), { ...phasePatch(room.settings, "over"), activeTeam: null });
        } else {
          tx.update(roomRef(id), { ...phasePatch(room.settings, "roundEnd"), activeTeam: null });
        }
        return;
      }
      await beginHalfOrSkipSilent(tx, room, "silver");
      return;
    }

    case "roundEnd": {
      if (room.winner) {
        tx.update(roomRef(id), { ...phasePatch(room.settings, "over"), activeTeam: null });
        return;
      }
      if (room.showdown) {
        await beginShowdown(tx, room);
        return;
      }
      const nextRound = room.round + 1;
      const encryptor: Record<TeamId, string> = { gold: "", silver: "" };
      const idx: Record<TeamId, number> = { gold: 0, silver: 0 };
      for (const team of TEAMS) {
        const members = room.teams[team].members;
        const next = (room.teams[team].encryptorIdx + 1) % Math.max(members.length, 1);
        idx[team] = next;
        encryptor[team] = members[next] ?? members[0] ?? "";
      }
      tx.update(roomRef(id), {
        ...phasePatch(room.settings, "encrypt"),
        round: nextRound,
        clues: { gold: null, silver: null },
        cluesIn: { gold: false, silver: false },
        encryptor,
        activeTeam: null,
        "teams.gold.encryptorIdx": idx.gold,
        "teams.silver.encryptorIdx": idx.silver,
      });
      return;
    }

    case "showdown": {
      await resolveShowdown(tx, room);
      return;
    }

    default:
      return;
  }
}

/**
 * Open the decisive keyword sheet.
 *
 * Do not read private/{team} or write the other side's guesses here —
 * rules seal keywords from the opposing team, so the host (on one side)
 * used to get permission-denied the moment they tapped "Keyword showdown".
 * Prefill is each team's own job: setTheory mirrors onto guesses/{uid},
 * and seedOwnShowdown copies leftover private.theories onto that sheet.
 */
async function beginShowdown(tx: Transaction, room: Room): Promise<void> {
  tx.update(roomRef(room.id), {
    ...phasePatch(room.settings, "showdown"),
    showdownIn: { gold: false, silver: false },
    activeTeam: null,
  });
}

/**
 * Copy this player's team theories onto their guess sheets. Own private
 * only — safe to call from any teammate when showdown opens.
 */
async function seedOwnShowdown({ roomId }: { roomId: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  if (room.phase !== "showdown") return { ok: true };
  const team = room.players[uid]?.team;
  if (!team) return { ok: true };

  const members = room.teams[team].members;
  const priv = await getDoc(privateRef(roomId, team));
  const theories = wordsRecord(priv.data()?.theories as Record<string, string> | undefined);
  const mine = await getDoc(guessRef(roomId, uid));
  const prev = wordsRecord(mine.data()?.words as Record<string, string> | undefined);
  const words = {
    "1": prev["1"] || theories["1"],
    "2": prev["2"] || theories["2"],
    "3": prev["3"] || theories["3"],
    "4": prev["4"] || theories["4"],
  };

  await Promise.all(members.map((u) =>
    setDoc(guessRef(roomId, u), { uid: u, team, members, words }, { merge: true }).catch(() => {})
  ));
  return { ok: true };
}

type GuessDoc = { words?: Record<string, string>; submittedAt?: number | null };

/**
 * Flip to over so final/keys and both guess sheets become readable.
 * Scoring happens in settleShowdown — rules refuse those reads while
 * phase is still showdown, which is what made the host's resolve fail.
 */
async function resolveShowdown(tx: Transaction, room: Room): Promise<void> {
  const goldMembers = room.teams.gold.members;
  const silverMembers = room.teams.silver.members;

  if (goldMembers.length === 0 || silverMembers.length === 0) {
    const winner: TeamId | "draw" =
      goldMembers.length === 0 && silverMembers.length === 0 ? "draw"
      : goldMembers.length === 0 ? "silver"
      : "gold";
    tx.update(roomRef(room.id), {
      ...phasePatch(room.settings, "over"),
      activeTeam: null,
      winner,
      endReason: "showdown",
      showdownHits: { gold: 0, silver: 0 },
      showdownGuesses: { gold: ["", "", "", ""], silver: ["", "", "", ""] },
      showdownTimeBreak: false,
    });
    return;
  }

  tx.update(roomRef(room.id), {
    ...phasePatch(room.settings, "over"),
    activeTeam: null,
    winner: null,
    endReason: "showdown",
    showdownHits: null,
    showdownTimeBreak: false,
  });
}

/** Grade both sheets now that phase == 'over' has unsealed the keys. */
async function settleShowdown(roomId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) return;
    const room = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (room.phase !== "over" || room.endReason !== "showdown") return;
    if (room.showdownHits) return;

    const id = room.id;
    const goldMembers = room.teams.gold.members;
    const silverMembers = room.teams.silver.members;
    if (goldMembers.length === 0 || silverMembers.length === 0) return;

    const keysSnap = await tx.get(doc(db, "rooms", id, "final", "keys"));
    const guessSnaps = {
      gold: await tx.get(guessRef(id, goldMembers[0])),
      silver: await tx.get(guessRef(id, silverMembers[0])),
    };

    const keys = (keysSnap.data() ?? {}) as Record<TeamId, string[]>;
    const goldGuess = (guessSnaps.gold.data() ?? {}) as GuessDoc;
    const silverGuess = (guessSnaps.silver.data() ?? {}) as GuessDoc;
    const guesses: Record<TeamId, string[]> = {
      gold: room.showdownGuesses?.gold ?? wordsToArr(goldGuess.words),
      silver: room.showdownGuesses?.silver ?? wordsToArr(silverGuess.words),
    };

    const scored = scoreShowdown(guesses, {
      gold: keys.gold ?? [],
      silver: keys.silver ?? [],
    }, room.lang);

    let winner: TeamId | "draw" = scored.winner;
    let timeBreak = false;

    if (winner === "draw") {
      const gMs = room.submitMs?.gold ?? 0;
      const sMs = room.submitMs?.silver ?? 0;
      if (gMs > 0 || sMs > 0) {
        if (gMs < sMs) { winner = "gold"; timeBreak = true; }
        else if (sMs < gMs) { winner = "silver"; timeBreak = true; }
      }
      if (winner === "draw") {
        const gAt = goldGuess.submittedAt ?? Number.POSITIVE_INFINITY;
        const sAt = silverGuess.submittedAt ?? Number.POSITIVE_INFINITY;
        if (gAt < sAt) { winner = "gold"; timeBreak = true; }
        else if (sAt < gAt) { winner = "silver"; timeBreak = true; }
      }
    }

    tx.update(roomRef(id), {
      winner,
      endReason: "showdown",
      showdownHits: scored.hits,
      showdownGuesses: guesses,
      showdownTimeBreak: timeBreak,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Write graded side(s) into the round log, update scores, open reveal.
 * `activeReveal` null = show both teams (round-1 dual reveal).
 * `submitMsBump` adds decrypt/intercept elapsed time for this half.
 */
function applyResolvedSides(
  tx: Transaction,
  room: Room,
  graded: Partial<Record<TeamId, GradedSide>>,
  prev: RoundRecord | undefined,
  bothDone: boolean,
  activeReveal: TeamId | null,
  submitMsBump: Record<TeamId, number> = emptySubmitMs(),
): void {
  const id = room.id;
  const round = room.round;
  const score = {
    gold: { ...room.teams.gold.score },
    silver: { ...room.teams.silver.score },
  };

  const data = {
    gold: prev?.data?.gold ?? emptyRoundSide(),
    silver: prev?.data?.silver ?? emptyRoundSide(),
  };

  for (const t of TEAMS) {
    const g = graded[t];
    if (!g) continue;
    data[t] = g.side;
    if (g.faulted) score[t].fault += 1;
    if (g.wasBreached) score[OTHER[t]].breach += 1;
  }

  tx.set(doc(db, "rooms", id, "rounds", String(round)), {
    round,
    suddenDeath: false,
    at: Date.now(),
    data,
  } satisfies RoundRecord);

  const submitMs: Record<TeamId, number> = {
    gold: (room.submitMs?.gold ?? 0) + (submitMsBump.gold ?? 0),
    silver: (room.submitMs?.silver ?? 0) + (submitMsBump.silver ?? 0),
  };

  const patch: Record<string, unknown> = {
    ...phasePatch(room.settings, "reveal"),
    activeTeam: activeReveal,
    clues: room.clues,
    submitMs,
    "teams.gold.score": score.gold,
    "teams.silver.score": score.silver,
  };

  if (bothDone) {
    const verdict = evaluate(
      score.gold, score.silver, round, room.settings, room.showdown
    );
    patch.showdown = room.showdown || Boolean(verdict.showdown);
    patch.winner = verdict.done ? verdict.winner ?? null : null;
    patch.endReason = verdict.done ? verdict.reason ?? null : null;
  }

  tx.update(roomRef(id), patch);
}

/** Elapsed from phase start to a draft submit timestamp (0 if missing). */
function elapsedFromPhase(room: Room, at: unknown): number {
  if (typeof at !== "number" || !Number.isFinite(at)) return 0;
  const start = room.phaseStartedAt ?? at;
  return Math.max(0, at - start);
}

/** Round 1: score both decrypts together, then dual reveal. */
async function resolveRound1(tx: Transaction, room: Room): Promise<void> {
  const id = room.id;
  const round = room.round;

  const secretSnaps = {
    gold: await tx.get(secretRef(id, "gold", round)),
    silver: await tx.get(secretRef(id, "silver", round)),
  };
  const draftSnaps = {
    gold: await tx.get(draftRef(id, "gold", round)),
    silver: await tx.get(draftRef(id, "silver", round)),
  };
  const prevRec = await tx.get(doc(db, "rooms", id, "rounds", String(round)));

  const graded: Partial<Record<TeamId, GradedSide>> = {};
  const submitMsBump = emptySubmitMs();
  for (const t of TEAMS) {
    const secret = secretSnaps[t].data() as {
      code?: number[]; encryptorUid?: string;
    } | undefined;
    const clues = room.clues[t] || [];
    const draft = draftSnaps[t].data() as DraftPrev | undefined;
    const decrypt = (draft?.decrypt as (number | null)[])
      || [null, null, null];
    graded[t] = gradeSide(
      round, t,
      secret?.code || [0, 0, 0],
      secret?.encryptorUid ?? null,
      clues, decrypt, [null, null, null],
    );
    submitMsBump[t] += elapsedFromPhase(room, draft?.submittedDecryptAt);
  }

  applyResolvedSides(
    tx, room, graded,
    prevRec.data() as RoundRecord | undefined,
    /* bothDone */ true,
    /* activeReveal */ null,
    submitMsBump,
  );
}

/**
 * Score the active team's code (owners' decrypt + opponents' intercept),
 * merge into the round log, then open the reveal beat.
 */
async function resolveHalf(tx: Transaction, room: Room): Promise<void> {
  const id = room.id;
  const round = room.round;
  const active = room.activeTeam ?? "gold";
  const opp = OTHER[active];

  const secret = await tx.get(secretRef(id, active, round));
  const ownerDraft = await tx.get(draftRef(id, active, round));
  const oppDraft = await tx.get(draftRef(id, opp, round));
  const prevRec = await tx.get(doc(db, "rooms", id, "rounds", String(round)));

  const ownerPrev = ownerDraft.data() as DraftPrev | undefined;
  const oppPrev = oppDraft.data() as DraftPrev | undefined;
  const graded = gradeSide(
    round, active,
    (secret.data()?.code as number[]) || [0, 0, 0],
    (secret.data()?.encryptorUid as string) ?? null,
    room.clues[active] || [],
    (ownerPrev?.decrypt as (number | null)[]) || [null, null, null],
    (oppPrev?.intercept as (number | null)[]) || [null, null, null],
  );

  const submitMsBump = emptySubmitMs();
  submitMsBump[active] += elapsedFromPhase(room, ownerPrev?.submittedDecryptAt);
  submitMsBump[opp] += elapsedFromPhase(room, oppPrev?.submittedInterceptAt);

  applyResolvedSides(
    tx, room, { [active]: graded },
    prevRec.data() as RoundRecord | undefined,
    active === "silver",
    active,
    submitMsBump,
  );
}

/* ------------------------------------------------------------------ */
/* host controls                                                      */
/* ------------------------------------------------------------------ */

async function hostControl({ roomId, action }: { roomId: string; action: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  const now = syncedNow();

  if (action === "pause") {
    const left = room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - now) : null;
    await runTransaction(db, async (tx) => {
      tx.update(roomRef(roomId), { paused: true, pausedRemaining: left, updatedAt: now, ...clockStamp() });
    });
  } else if (action === "resume") {
    const snap = await getDoc(roomRef(roomId));
    const left = snap.data()?.pausedRemaining as number | null | undefined;
    await runTransaction(db, async (tx) => {
      tx.update(roomRef(roomId), {
        paused: false, phaseStartedAt: now,
        phaseEndsAt: left == null ? null : now + left,
        pausedRemaining: deleteField(), updatedAt: now,
        ...clockStamp(),
      });
    });
  } else if (action === "addTime") {
    if (room.phaseEndsAt == null) return { ok: true };
    await runTransaction(db, async (tx) => {
      tx.update(roomRef(roomId), { phaseEndsAt: room.phaseEndsAt! + 30_000, updatedAt: now, ...clockStamp() });
    });
  } else if (action === "endGame") {
    // Host bail-out: skip the results screen and reopen the lobby.
    if (room.phase === "lobby") return { ok: true };
    await returnToLobby(roomId, room);
  } else {
    throw new GameError("invalid-argument", S(room.lang).err.unknownAction);
  }
  return { ok: true };
}

/**
 * Wipe round state and reopen the lobby; teams/players stay.
 *
 * Deletes by known paths — never `getDocs` on `private` / `guesses` /
 * `final`. Those collections have member-scoped (or phase-sealed) reads,
 * so a collection query is rejected for everyone mid-game even when
 * individual deletes are allowed.
 */
async function returnToLobby(roomId: string, room: Room) {
  const maxR = Math.max(room.round, room.settings?.maxRounds ?? 8) + 4;
  const uids = Object.keys(room.players);
  const jobs: Promise<unknown>[] = [];

  for (const t of TEAMS) {
    jobs.push(deleteDoc(privateRef(roomId, t)));
    jobs.push(deleteDoc(deckRef(roomId, t)));
  }
  jobs.push(deleteDoc(doc(db, "rooms", roomId, "final", "keys")));

  for (let r = 1; r <= maxR; r++) {
    jobs.push(deleteDoc(doc(db, "rooms", roomId, "rounds", String(r))));
    for (const t of TEAMS) {
      jobs.push(deleteDoc(secretRef(roomId, t, r)));
      jobs.push(deleteDoc(draftRef(roomId, t, r)));
    }
    for (const uid of uids) {
      jobs.push(deleteDoc(doc(db, "rooms", roomId, "away", `${r}_${uid}`)));
    }
  }
  for (const uid of uids) {
    jobs.push(deleteDoc(guessRef(roomId, uid)));
  }

  // Orphans in fully-readable collections (safe to list).
  for (const sub of ["rounds", "drafts", "secret", "away"] as const) {
    try {
      const snap = await getDocs(collection(db, "rooms", roomId, sub));
      for (const d of snap.docs) jobs.push(deleteDoc(d.ref));
    } catch {
      /* list denied — known-path deletes above already cover the usual ids */
    }
  }

  await Promise.allSettled(jobs);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) return;
    const cur = asRoom(roomId, snap.data() as Record<string, unknown>);
    if (cur.phase === "lobby") return;
    tx.update(roomRef(roomId), {
      phase: "lobby", round: 0, showdown: false, paused: false,
      phaseEndsAt: null, phaseStartedAt: syncedNow(),
      ...clockStamp(),
      winner: null, endReason: null,
      clues: { gold: null, silver: null },
      cluesIn: { gold: false, silver: false },
      showdownIn: { gold: false, silver: false },
      submitMs: emptySubmitMs(),
      showdownHits: null,
      showdownGuesses: null,
      showdownTimeBreak: false,
      encryptor: { gold: null, silver: null },
      activeTeam: null,
      "teams.gold.score": { breach: 0, fault: 0 },
      "teams.silver.score": { breach: 0, fault: 0 },
      "teams.gold.encryptorIdx": 0,
      "teams.silver.encryptorIdx": 0,
      updatedAt: Date.now(),
    });
  });
}

async function rematch({ roomId }: { roomId: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "over") throw new GameError("failed-precondition", S(room.lang).err.notOver);
  await returnToLobby(roomId, room);
  return { ok: true };
}

/* ------------------------------------------------------------------ */

export const api = {
  createRoom, joinRoom, setTeam, shuffleTeams, kickPlayer, leaveRoom,
  updateSettings, startGame, submitClues, submitShowdown, advancePhase,
  hostControl, rematch, shuffleTeamKeys, seedOwnShowdown,
};

export function errText(e: unknown, lang: Lang = "ar"): string {
  if (e instanceof GameError) return e.message;
  const code = (e as { code?: string })?.code || "";
  const m = (e as { message?: string })?.message || "";
  const s = S(lang);
  if (code === "permission-denied" || /insufficient permissions|Missing or insufficient/i.test(m)) {
    return s.err.permission;
  }
  if (!m || m === "INTERNAL") return s.err.generic;
  return m;
}
