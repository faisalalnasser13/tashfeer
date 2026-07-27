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
  doc, collection, getDoc, getDocs, deleteDoc, runTransaction,
  arrayUnion, deleteField, writeBatch, Transaction, DocumentReference,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import {
  TeamId, TEAMS, OTHER, Phase, Room, Settings, RoundRecord,
  allCodes, shuffle, codesEqual, evaluate, encodeCode, decodeCode,
} from "./rules";
import { normalizeAr, normalizeKey } from "./arabic";
import { dealWords } from "./words";

/* ------------------------------------------------------------------ */
/* plumbing                                                           */
/* ------------------------------------------------------------------ */

const ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I L O 0 1
const CLOCK_TOLERANCE_MS = 1500;

export const DEFAULTS: Settings = {
  encryptSecs: 60,
  guessSecs: 60,
  maxRounds: 8,
  useTimer: true,
};

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

function me(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new GameError("unauthenticated", "سجّل الدخول أولًا.");
  return uid;
}

async function loadRoom(id: string): Promise<Room> {
  const snap = await getDoc(roomRef(id));
  if (!snap.exists()) throw new GameError("not-found", "لا توجد غرفة بهذا الرمز.");
  return { id, ...(snap.data() as object) } as Room;
}

function requireHost(room: Room, uid: string) {
  if (room.hostUid !== uid) {
    throw new GameError("permission-denied", "هذا التحكم للمضيف فقط.");
  }
}

function newRoomId(): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return s;
}

function membersOf(room: Room, team: TeamId): string[] {
  return Object.entries(room.players)
    .filter(([, p]) => p.team === team)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    .map(([uid]) => uid);
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function phaseDuration(settings: Settings, phase: Phase): number | null {
  if (phase === "keys") return 12_000;
  if (phase === "reveal") return 15_000;
  if (phase === "roundEnd") return 25_000;
  if (!settings.useTimer) return null;
  if (phase === "encrypt") return settings.encryptSecs * 1000;
  if (phase === "guess") return settings.guessSecs * 1000;
  return null;
}

function phasePatch(settings: Settings, phase: Phase) {
  const now = Date.now();
  const dur = phaseDuration(settings, phase);
  return {
    phase,
    phaseStartedAt: now,
    phaseEndsAt: dur === null ? null : now + dur,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* lobby                                                              */
/* ------------------------------------------------------------------ */

async function createRoom({ name, avatar }: { name: string; avatar: number }) {
  const uid = me();
  const clean = String(name || "").trim().slice(0, 16);
  if (!clean) throw new GameError("invalid-argument", "اكتب اسمك.");

  for (let attempt = 0; attempt < 6; attempt++) {
    const id = newRoomId();
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef(id));
      if (snap.exists()) return false;
      const now = Date.now();
      tx.set(roomRef(id), {
        hostUid: uid,
        phase: "lobby",
        round: 0,
        suddenDeath: false,
        paused: false,
        phaseStartedAt: now,
        phaseEndsAt: null,
        settings: { ...DEFAULTS },
        players: { [uid]: { name: clean, avatar: Number(avatar) || 0, team: null, joinedAt: now } },
        teams: {
          gold: { score: { breach: 0, fault: 0 }, members: [], encryptorIdx: 0 },
          silver: { score: { breach: 0, fault: 0 }, members: [], encryptorIdx: 0 },
        },
        clues: { gold: null, silver: null },
        cluesIn: { gold: false, silver: false },
        encryptor: { gold: null, silver: null },
        winner: null,
        endReason: null,
        createdAt: now,
        updatedAt: now,
      });
      return true;
    });
    if (created) return { roomId: id };
  }
  throw new GameError("internal", "تعذّر إنشاء الغرفة. حاول مرة أخرى.");
}

async function joinRoom({ roomId, name, avatar }: { roomId: string; name: string; avatar: number }) {
  const uid = me();
  const id = String(roomId || "").toUpperCase().trim();
  const clean = String(name || "").trim().slice(0, 16);
  if (!clean) throw new GameError("invalid-argument", "اكتب اسمك.");

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(id));
    if (!snap.exists()) throw new GameError("not-found", "لا توجد غرفة بهذا الرمز.");
    const room = snap.data() as Room;
    const existing = room.players[uid];
    if (!existing && room.phase !== "lobby") {
      throw new GameError("failed-precondition", "بدأت الجولة. انتظر انتهاء اللعبة.");
    }
    if (!existing && Object.keys(room.players).length >= 10) {
      throw new GameError("resource-exhausted", "الغرفة ممتلئة.");
    }
    tx.update(roomRef(id), {
      [`players.${uid}`]: existing
        ? { ...existing, name: clean, avatar: Number(avatar) || 0 }
        : { name: clean, avatar: Number(avatar) || 0, team: null, joinedAt: Date.now() },
      updatedAt: Date.now(),
    });
  });
  return { roomId: id };
}

async function setTeam({ roomId, team }: { roomId: string; team: string | null }) {
  const uid = me();
  if (team !== null && team !== "gold" && team !== "silver") {
    throw new GameError("invalid-argument", "فريق غير معروف.");
  }
  const room = await loadRoom(roomId);
  if (room.phase !== "lobby") {
    throw new GameError("failed-precondition", "لا يمكن تغيير الفريق أثناء اللعب.");
  }
  if (!room.players[uid]) throw new GameError("permission-denied", "لست في هذه الغرفة.");
  await runTransaction(db, async (tx) => {
    tx.update(roomRef(roomId), { [`players.${uid}.team`]: team, updatedAt: Date.now() });
  });
  return { ok: true };
}

async function shuffleTeams({ roomId }: { roomId: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "lobby") throw new GameError("failed-precondition", "الفرق تُوزَّع قبل البدء.");

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
  if (target === uid) throw new GameError("invalid-argument", "لا يمكنك إخراج نفسك.");
  await runTransaction(db, async (tx) => {
    tx.update(roomRef(roomId), {
      [`players.${target}`]: deleteField(),
      updatedAt: Date.now(),
    });
  });
  return { ok: true };
}

async function leaveRoom({ roomId }: { roomId: string }) {
  const uid = me();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) return;
    const room = snap.data() as Room;
    const remaining = Object.keys(room.players).filter((u) => u !== uid);
    if (remaining.length === 0) {
      tx.delete(roomRef(roomId));
      return;
    }
    const patch: Record<string, unknown> = {
      [`players.${uid}`]: deleteField(),
      updatedAt: Date.now(),
    };
    if (room.hostUid === uid) {
      remaining.sort((a, b) => room.players[a].joinedAt - room.players[b].joinedAt);
      patch.hostUid = remaining[0];
    }
    tx.update(roomRef(roomId), patch);
  });
  return { ok: true };
}

async function updateSettings({ roomId, settings }: { roomId: string; settings: Partial<Settings> }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "lobby") throw new GameError("failed-precondition", "الإعدادات تُضبط قبل البدء.");
  const s = settings ?? {};
  const next: Settings = {
    encryptSecs: clamp(Number(s.encryptSecs ?? room.settings.encryptSecs), 30, 300),
    guessSecs: clamp(Number(s.guessSecs ?? room.settings.guessSecs), 30, 400),
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
  if (room.phase !== "lobby") throw new GameError("failed-precondition", "اللعبة بدأت بالفعل.");

  const gold = membersOf(room, "gold");
  const silver = membersOf(room, "silver");
  if (gold.length < 2 || silver.length < 2) {
    throw new GameError("failed-precondition", "تحتاج لاعبَين على الأقل في كل فريق.");
  }

  const words = dealWords(8);
  const batch = writeBatch(db);
  const finalKeys: Record<string, string[]> = {};

  for (const team of TEAMS) {
    const members = team === "gold" ? gold : silver;
    const keys = team === "gold" ? words.slice(0, 4) : words.slice(4, 8);
    batch.set(privateRef(roomId, team), { team, keys, members, usedClues: [] });
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
    suddenDeath: false,
    winner: null,
    endReason: null,
    clues: { gold: null, silver: null },
    cluesIn: { gold: false, silver: false },
    encryptor: { gold: gold[0], silver: silver[0] },
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
    if (existing.exists()) return;

    const raw = (deckSnap.data()?.deck as (string | number[])[]) || [];
    let deck = raw.length > 0 ? raw.map(decodeCode) : shuffle(allCodes());

    tx.set(deckRef(roomId, team), {
      team,
      members: deckSnap.data()?.members ?? [],
      deck: deck.slice(1).map(encodeCode),
    });
    tx.set(secretRef(roomId, team, round), {
      team, round, code: deck[0], encryptorUid: uid,
    });
  });
}

/* ------------------------------------------------------------------ */
/* clues                                                              */
/* ------------------------------------------------------------------ */

async function submitClues({ roomId, clues: raw }: { roomId: string; clues: string[] }) {
  const uid = me();
  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new GameError("invalid-argument", "اكتب التلميحات الثلاثة.");
  }
  const clues = raw.map((c) => String(c || "").trim().slice(0, 40));
  if (clues.some((c) => !c)) throw new GameError("invalid-argument", "لا تترك تلميحًا فارغًا.");

  const room = await loadRoom(roomId);
  if (room.phase !== "encrypt") throw new GameError("failed-precondition", "ليست مرحلة كتابة التلميحات.");

  const team = TEAMS.find((t) => room.encryptor[t] === uid) ?? null;
  if (!team) throw new GameError("permission-denied", "أنت لست المُشفِّر في هذه الجولة.");

  const privSnap = await getDoc(privateRef(roomId, team));
  const priv = privSnap.data() as { keys: string[]; usedClues: string[] } | undefined;
  if (!priv) throw new GameError("internal", "بيانات الفريق غير متاحة.");

  const normClues = clues.map(normalizeKey);
  const normKeys = priv.keys.map(normalizeKey);
  for (let i = 0; i < 3; i++) {
    if (normKeys.includes(normClues[i])) {
      throw new GameError("invalid-argument", `التلميح ${i + 1} هو إحدى كلماتكم. اختر غيره.`);
    }
  }
  if (new Set(normClues).size !== 3) {
    throw new GameError("invalid-argument", "التلميحات الثلاثة متطابقة أو مكررة.");
  }
  const used = new Set((priv.usedClues || []).map(normalizeAr));
  for (const c of clues) {
    if (used.has(normalizeAr(c))) {
      throw new GameError("invalid-argument", `استخدمتم "${c}" في جولة سابقة.`);
    }
  }

  await runTransaction(db, async (tx) => {
    tx.update(secretRef(roomId, team, room.round), { clues });
    tx.update(privateRef(roomId, team), {
      usedClues: arrayUnion(...clues.map(normalizeAr)),
    });
    tx.update(roomRef(roomId), { [`cluesIn.${team}`]: true, updatedAt: Date.now() });
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
    if (!snap.exists()) throw new GameError("not-found", "الغرفة غير موجودة.");
    const room = { id: roomId, ...(snap.data() as object) } as Room;

    if (!room.players[uid]) throw new GameError("permission-denied", "لست في هذه الغرفة.");
    if (room.paused) return;
    if (fromPhase && (room.phase !== fromPhase || room.round !== fromRound)) return;

    const expired =
      room.phaseEndsAt !== null && Date.now() + CLOCK_TOLERANCE_MS >= room.phaseEndsAt;

    if (!expired) {
      if (force) requireHost(room, uid);
      else if (!(await everyoneReady(tx, room))) {
        throw new GameError("failed-precondition", "لم ينتهِ الوقت بعد.");
      }
    }
    await runTransition(tx, room);
  });
  return { ok: true };
}

/** Nothing left to wait for: both clue sets in, or both teams sent. */
async function everyoneReady(tx: Transaction, room: Room): Promise<boolean> {
  if (room.phase === "encrypt") {
    return room.cluesIn.gold === true && room.cluesIn.silver === true;
  }
  if (room.phase === "guess") {
    for (const team of TEAMS) {
      const d = await tx.get(draftRef(room.id, team, room.round));
      if (!d.data()?.submitted) return false;
    }
    return true;
  }
  return false;
}

async function runTransition(tx: Transaction, room: Room): Promise<void> {
  const id = room.id;

  switch (room.phase) {
    case "keys": {
      tx.update(roomRef(id), phasePatch(room.settings, "encrypt"));
      return;
    }

    case "encrypt": {
      const clues: Record<TeamId, string[]> = { gold: [], silver: [] };
      for (const team of TEAMS) {
        const s = await tx.get(secretRef(id, team, room.round));
        const d = s.data() as { clues?: string[] } | undefined;
        clues[team] = d?.clues && d.clues.length === 3 ? d.clues : [];
      }
      for (const team of TEAMS) {
        tx.set(draftRef(id, team, room.round), {
          team,
          round: room.round,
          members: room.teams[team].members,
          lockedFor: room.encryptor[team] ?? null,
          decrypt: [null, null, null],
          intercept: [null, null, null],
          submitted: null,
        });
      }
      tx.update(roomRef(id), { ...phasePatch(room.settings, "guess"), clues });
      return;
    }

    case "guess": {
      await resolveRound(tx, room);
      return;
    }

    case "reveal": {
      tx.update(roomRef(id), phasePatch(room.settings, "roundEnd"));
      return;
    }

    case "roundEnd": {
      if (room.winner) {
        tx.update(roomRef(id), phasePatch(room.settings, "over"));
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
        "teams.gold.encryptorIdx": idx.gold,
        "teams.silver.encryptorIdx": idx.silver,
      });
      return;
    }

    default:
      return;
  }
}

async function resolveRound(tx: Transaction, room: Room): Promise<void> {
  const id = room.id;
  const round = room.round;

  const codes: Record<string, number[]> = {};
  const encs: Record<string, string | null> = {};
  const drafts: Record<string, { decrypt: (number | null)[]; intercept: (number | null)[] }> = {};

  for (const team of TEAMS) {
    const s = await tx.get(secretRef(id, team, round));
    codes[team] = (s.data()?.code as number[]) || [0, 0, 0];
    encs[team] = (s.data()?.encryptorUid as string) ?? null;
    const d = await tx.get(draftRef(id, team, round));
    drafts[team] = {
      decrypt: (d.data()?.decrypt as (number | null)[]) || [null, null, null],
      intercept: (d.data()?.intercept as (number | null)[]) || [null, null, null],
    };
  }

  const score = {
    gold: { ...room.teams.gold.score },
    silver: { ...room.teams.silver.score },
  };
  const record: RoundRecord = {
    round, suddenDeath: room.suddenDeath, at: Date.now(),
    data: {} as RoundRecord["data"],
  };

  for (const team of TEAMS) {
    const opp = OTHER[team];
    const code = codes[team];
    const clues = room.clues[team] || [];
    const noClues = clues.length !== 3;

    const decrypt = drafts[team].decrypt;
    const intercept = drafts[opp].intercept;

    const faulted = noClues || !codesEqual(decrypt, code);
    const wasBreached = !noClues && round >= 2 && codesEqual(intercept, code);

    if (faulted) score[team].fault += 1;
    if (wasBreached) score[opp].breach += 1;

    record.data[team] = {
      encryptorUid: encs[team], clues: noClues ? [] : clues, code,
      decrypt, intercept, noClues, faulted, wasBreached,
    };
  }

  const verdict = evaluate(score.gold, score.silver, round, room.settings, room.suddenDeath);

  tx.set(doc(db, "rooms", id, "rounds", String(round)), record);
  tx.update(roomRef(id), {
    ...phasePatch(room.settings, "reveal"),
    "teams.gold.score": score.gold,
    "teams.silver.score": score.silver,
    suddenDeath: room.suddenDeath || Boolean(verdict.suddenDeath),
    winner: verdict.done ? verdict.winner ?? null : null,
    endReason: verdict.done ? verdict.reason ?? null : null,
  });
}

/* ------------------------------------------------------------------ */
/* host controls                                                      */
/* ------------------------------------------------------------------ */

async function hostControl({ roomId, action }: { roomId: string; action: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  const now = Date.now();

  if (action === "pause") {
    const left = room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - now) : null;
    await runTransaction(db, async (tx) => {
      tx.update(roomRef(roomId), { paused: true, pausedRemaining: left, updatedAt: now });
    });
  } else if (action === "resume") {
    const snap = await getDoc(roomRef(roomId));
    const left = snap.data()?.pausedRemaining as number | null | undefined;
    await runTransaction(db, async (tx) => {
      tx.update(roomRef(roomId), {
        paused: false, phaseStartedAt: now,
        phaseEndsAt: left == null ? null : now + left,
        pausedRemaining: deleteField(), updatedAt: now,
      });
    });
  } else if (action === "addTime") {
    if (room.phaseEndsAt == null) return { ok: true };
    await runTransaction(db, async (tx) => {
      tx.update(roomRef(roomId), { phaseEndsAt: room.phaseEndsAt! + 30_000, updatedAt: now });
    });
  } else if (action === "endGame") {
    await runTransaction(db, async (tx) => {
      tx.update(roomRef(roomId), {
        phase: "over", winner: "draw",
        endReason: "abandoned", phaseEndsAt: null, updatedAt: now,
      });
    });
  } else {
    throw new GameError("invalid-argument", "أمر غير معروف.");
  }
  return { ok: true };
}

async function rematch({ roomId }: { roomId: string }) {
  const uid = me();
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "over") throw new GameError("failed-precondition", "اللعبة لم تنتهِ بعد.");

  for (const sub of ["rounds", "drafts", "secret", "away", "guesses", "final"]) {
    const snap = await getDocs(collection(db, "rooms", roomId, sub));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }

  await runTransaction(db, async (tx) => {
    tx.update(roomRef(roomId), {
      phase: "lobby", round: 0, suddenDeath: false, paused: false,
      phaseEndsAt: null, phaseStartedAt: Date.now(),
      winner: null, endReason: null,
      clues: { gold: null, silver: null },
      cluesIn: { gold: false, silver: false },
      encryptor: { gold: null, silver: null },
      "teams.gold.score": { breach: 0, fault: 0 },
      "teams.silver.score": { breach: 0, fault: 0 },
      "teams.gold.encryptorIdx": 0,
      "teams.silver.encryptorIdx": 0,
      updatedAt: Date.now(),
    });
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */

export const api = {
  createRoom, joinRoom, setTeam, shuffleTeams, kickPlayer, leaveRoom,
  updateSettings, startGame, submitClues, advancePhase, hostControl, rematch,
};

export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message || "";
  if (!m || m === "INTERNAL") return "حدث خطأ. حاول مرة أخرى.";
  return m;
}
