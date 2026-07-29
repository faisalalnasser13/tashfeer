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
  arrayUnion, deleteField, writeBatch, updateDoc, Transaction, DocumentReference,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import {
  TeamId, TEAMS, OTHER, HALF_ORDER, Phase, Room, Settings, RoundRecord,
  allCodes, shuffle, codesEqual, evaluate, encodeCode, decodeCode,
} from "./rules";
import { normalizeAr, normalizeKey } from "./arabic";
import { dealWords } from "./words";

/* ------------------------------------------------------------------ */
/* plumbing                                                           */
/* ------------------------------------------------------------------ */

const ID_ALPHABET = "0123456789";
/** Small skew so a slightly-fast phone isn't rejected at the true deadline. */
const CLOCK_SKEW_MS = 250;
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
export const TIMER_START_GRACE_MS = 500;
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
function pickBalancedTeam(goldN: number, silverN: number, uid: string): TeamId {
  if (goldN >= 4 && silverN >= 4) {
    throw new GameError("resource-exhausted", "كلا الفريقين مكتملان (4 لاعبين).");
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

function phaseDuration(settings: Settings, phase: Phase): number | null {
  // Keys / reveal / roundEnd: host-driven only (no auto clock).
  if (phase === "keys" || phase === "reveal" || phase === "roundEnd") return null;
  if (!settings.useTimer) return null;
  if (phase === "encrypt") return settings.encryptSecs * 1000;
  if (phase === "guess") return settings.guessSecs * 1000;
  return null;
}

/** Grace only on the timed play phases — not on 2s transition beats. */
function phaseGraceMs(phase: Phase): number {
  return phase === "encrypt" || phase === "guess" ? TIMER_GRACE_MS : 0;
}

function phasePatch(settings: Settings, phase: Phase) {
  const now = Date.now();
  const dur = phaseDuration(settings, phase);
  const startGrace =
    dur != null && (phase === "encrypt" || phase === "guess")
      ? TIMER_START_GRACE_MS
      : 0;
  return {
    phase,
    phaseStartedAt: now,
    // Visible 0:00. A hidden TIMER_GRACE_MS follows before advance.
    // Encrypt/guess also get TIMER_START_GRACE_MS before the clock drains.
    phaseEndsAt: dur === null ? null : now + startGrace + dur,
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
        activeTeam: null,
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
  const id = String(roomId || "").replace(/\D/g, "").slice(0, 4);
  const clean = String(name || "").trim().slice(0, 16);
  if (!clean) throw new GameError("invalid-argument", "اكتب اسمك.");

  let assigned: TeamId | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(id));
    if (!snap.exists()) throw new GameError("not-found", "لا توجد غرفة بهذا الرمز.");
    const room = snap.data() as Room;
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
      if (!team && room.phase !== "lobby") {
        team = pickBalancedTeam(
          room.teams.gold.members.length,
          room.teams.silver.members.length,
          uid
        );
        patch[`players.${uid}`] = {
          ...existing,
          name: clean,
          avatar: Number(avatar) || 0,
          team,
        };
        patch[`teams.${team}.members`] = arrayUnion(uid);
        assigned = team;
      }
      tx.update(roomRef(id), patch);
      return;
    }

    if (Object.keys(room.players).length >= 10) {
      throw new GameError("resource-exhausted", "الغرفة ممتلئة.");
    }

    // Lobby: sit unassigned until they pick a side.
    if (room.phase === "lobby") {
      tx.update(roomRef(id), {
        [`players.${uid}`]: {
          name: clean, avatar: Number(avatar) || 0, team: null, joinedAt: now,
        },
        updatedAt: now,
      });
      return;
    }

    // Mid-game (and post-game over): auto-seat on the shorter team.
    const team = pickBalancedTeam(
      room.teams.gold.members.length,
      room.teams.silver.members.length,
      uid
    );
    assigned = team;
    tx.update(roomRef(id), {
      [`players.${uid}`]: {
        name: clean, avatar: Number(avatar) || 0, team, joinedAt: now,
      },
      [`teams.${team}.members`]: arrayUnion(uid),
      updatedAt: now,
    });
  });

  // Patch private/deck membership after the room write so rules see our team.
  if (assigned) {
    await Promise.all([
      updateDoc(privateRef(id, assigned), { members: arrayUnion(uid) }).catch(() => {}),
      updateDoc(deckRef(id, assigned), { members: arrayUnion(uid) }).catch(() => {}),
    ]);
  }

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
    for (const t of ["gold", "silver"] as TeamId[]) {
      if (room.teams[t].members.includes(uid)) {
        patch[`teams.${t}.members`] = room.teams[t].members.filter((u) => u !== uid);
      }
    }
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
    suddenDeath: false,
    winner: null,
    endReason: null,
    clues: { gold: null, silver: null },
    cluesIn: { gold: false, silver: false },
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
    throw new GameError("invalid-argument", "فريق غير معروف.");
  }
  const side = team as TeamId;
  const room = await loadRoom(roomId);
  requireHost(room, uid);
  if (room.phase !== "keys") {
    throw new GameError("failed-precondition", "خلط المفاتيح قبل بدء التشفير فقط.");
  }

  const fresh = dealWords(4);

  await runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef(roomId));
    if (!roomSnap.exists()) throw new GameError("not-found", "الغرفة غير موجودة.");
    const cur = roomSnap.data() as Room;
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
      room.phaseEndsAt !== null
      && Date.now() + CLOCK_SKEW_MS >= room.phaseEndsAt + phaseGraceMs(room.phase);

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
};

type GradedSide = ReturnType<typeof gradeSide>;

/** Nothing left to wait for: both clue sets in, or the active half is done. */
async function everyoneReady(tx: Transaction, room: Room): Promise<boolean> {
  if (room.phase === "encrypt") {
    return room.cluesIn.gold === true && room.cluesIn.silver === true;
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
        suddenDeath: room.suddenDeath,
        clues: { gold: null, silver: null },
        cluesIn: { gold: false, silver: false },
        encryptor,
        activeTeam: null,
        "teams.gold.encryptorIdx": idx.gold,
        "teams.silver.encryptorIdx": idx.silver,
      });
      return;
    }

    default:
      return;
  }
}

/**
 * Write graded side(s) into the round log, update scores, open reveal.
 * `activeReveal` null = show both teams (round-1 dual reveal).
 */
function applyResolvedSides(
  tx: Transaction,
  room: Room,
  graded: Partial<Record<TeamId, GradedSide>>,
  prev: RoundRecord | undefined,
  bothDone: boolean,
  activeReveal: TeamId | null,
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
    suddenDeath: room.suddenDeath,
    at: Date.now(),
    data,
  } satisfies RoundRecord);

  const patch: Record<string, unknown> = {
    ...phasePatch(room.settings, "reveal"),
    activeTeam: activeReveal,
    clues: room.clues,
    "teams.gold.score": score.gold,
    "teams.silver.score": score.silver,
  };

  if (bothDone) {
    const verdict = evaluate(
      score.gold, score.silver, round, room.settings, room.suddenDeath
    );
    patch.suddenDeath = room.suddenDeath || Boolean(verdict.suddenDeath);
    patch.winner = verdict.done ? verdict.winner ?? null : null;
    patch.endReason = verdict.done ? verdict.reason ?? null : null;
  }

  tx.update(roomRef(id), patch);
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
  for (const t of TEAMS) {
    const secret = secretSnaps[t].data() as {
      code?: number[]; encryptorUid?: string;
    } | undefined;
    const clues = room.clues[t] || [];
    const decrypt = (draftSnaps[t].data()?.decrypt as (number | null)[])
      || [null, null, null];
    graded[t] = gradeSide(
      round, t,
      secret?.code || [0, 0, 0],
      secret?.encryptorUid ?? null,
      clues, decrypt, [null, null, null],
    );
  }

  applyResolvedSides(
    tx, room, graded,
    prevRec.data() as RoundRecord | undefined,
    /* bothDone */ true,
    /* activeReveal */ null,
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

  const graded = gradeSide(
    round, active,
    (secret.data()?.code as number[]) || [0, 0, 0],
    (secret.data()?.encryptorUid as string) ?? null,
    room.clues[active] || [],
    (ownerDraft.data()?.decrypt as (number | null)[]) || [null, null, null],
    (oppDraft.data()?.intercept as (number | null)[]) || [null, null, null],
  );

  applyResolvedSides(
    tx, room, { [active]: graded },
    prevRec.data() as RoundRecord | undefined,
    active === "silver",
    active,
  );
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
    // Host bail-out: skip the results screen and reopen the lobby.
    if (room.phase === "lobby") return { ok: true };
    await returnToLobby(roomId, room);
  } else {
    throw new GameError("invalid-argument", "أمر غير معروف.");
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
    const cur = snap.data() as Room;
    if (cur.phase === "lobby") return;
    tx.update(roomRef(roomId), {
      phase: "lobby", round: 0, suddenDeath: false, paused: false,
      phaseEndsAt: null, phaseStartedAt: Date.now(),
      winner: null, endReason: null,
      clues: { gold: null, silver: null },
      cluesIn: { gold: false, silver: false },
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
  if (room.phase !== "over") throw new GameError("failed-precondition", "اللعبة لم تنتهِ بعد.");
  await returnToLobby(roomId, room);
  return { ok: true };
}

/* ------------------------------------------------------------------ */

export const api = {
  createRoom, joinRoom, setTeam, shuffleTeams, kickPlayer, leaveRoom,
  updateSettings, startGame, submitClues, advancePhase, hostControl, rematch,
  shuffleTeamKeys,
};

export function errText(e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  const m = (e as { message?: string })?.message || "";
  if (code === "permission-denied" || /insufficient permissions|Missing or insufficient/i.test(m)) {
    return "لا صلاحية لهذا الإجراء. حدّث الصفحة وحاول مرة أخرى.";
  }
  if (!m || m === "INTERNAL") return "حدث خطأ. حاول مرة أخرى.";
  return m;
}
