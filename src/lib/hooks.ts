import { useEffect, useMemo, useRef, useState } from "react";
import {
  doc, collection, onSnapshot, setDoc, updateDoc, increment, query, orderBy,
} from "firebase/firestore";
import { db, api } from "./firebase";
import { ensureCode } from "./engine";
import type { AwayRecord, Draft, PlayerGuess, Room, RoundRecord, TeamId } from "./types";

/* ------------------------------------------------------------------ */
/* subscriptions                                                      */
/* ------------------------------------------------------------------ */

export function useRoom(roomId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setMissing(false);
      return;
    }
    return onSnapshot(
      doc(db, "rooms", roomId),
      (s) => {
        if (!s.exists()) { setMissing(true); setRoom(null); return; }
        setMissing(false);
        setRoom({ id: s.id, ...(s.data() as object) } as Room);
      },
      () => setMissing(true)
    );
  }, [roomId]);

  return { room, missing };
}

/**
 * Your team's four keywords, plus every clue your team has already
 * burned. Security rules make this document unreadable to the opponent.
 */
export function useTeamPrivate(roomId: string | null, team: TeamId | null) {
  const [data, setData] = useState<{ keys: string[]; usedClues: string[] } | null>(null);
  useEffect(() => {
    if (!roomId || !team) { setData(null); return; }
    return onSnapshot(
      doc(db, "rooms", roomId, "private", team),
      (s) =>
        setData(
          s.exists()
            ? {
                keys: (s.data().keys as string[]) ?? [],
                usedClues: (s.data().usedClues as string[]) ?? [],
              }
            : null
        ),
      () => setData(null)
    );
  }, [roomId, team]);
  return data;
}

/** The round's code. Only this round's encryptor can read it. */
export function useCode(roomId: string | null, team: TeamId | null, round: number, isEncryptor: boolean) {
  const [code, setCode] = useState<number[] | null>(null);
  useEffect(() => {
    if (!roomId || !team || !round || !isEncryptor) { setCode(null); return; }
    return onSnapshot(
      doc(db, "rooms", roomId, "secret", `${team}_r${round}`),
      (s) => setCode(s.exists() ? ((s.data().code as number[]) ?? null) : null),
      () => setCode(null)
    );
  }, [roomId, team, round, isEncryptor]);
  return code;
}

/** The shared live draft — the one document clients write to directly. */
export function useDraft(roomId: string | null, team: TeamId | null, round: number) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const path = roomId && team && round ? `rooms/${roomId}/drafts/${team}_r${round}` : null;

  useEffect(() => {
    if (!path) { setDraft(null); return; }
    return onSnapshot(doc(db, path), (s) => setDraft(s.exists() ? (s.data() as Draft) : null));
  }, [path]);

  const actions = useMemo(() => {
    if (!path) return null;
    const ref = doc(db, path);
    return {
      /**
       * One write per interaction. Assigning a digit can clear it from
       * another slot, and sending those as two writes loses the clear.
       */
      setCode: (field: "decrypt" | "intercept", values: (number | null)[]) =>
        updateDoc(ref, { [field]: values }).catch(() => {}),
      /** Whoever taps first, sends. Any teammate can end the round. */
      submit: (uid: string) =>
        updateDoc(ref, { submitted: uid }).catch(() => {}),
    };
  }, [path]);

  return { draft, actions };
}

/**
 * Every teammate's guess sheet, including your own. Rules keep these
 * inside the team; the opponent can't read them.
 */
export function useTeamGuesses(roomId: string | null, team: TeamId | null) {
  const [guesses, setGuesses] = useState<PlayerGuess[]>([]);
  useEffect(() => {
    if (!roomId || !team) { setGuesses([]); return; }
    return onSnapshot(
      collection(db, "rooms", roomId, "guesses"),
      (s) => setGuesses(
        s.docs.map((d) => d.data() as PlayerGuess).filter((g) => g.team === team)
      ),
      () => setGuesses([])
    );
  }, [roomId, team]);

  const setWord = useMemo(() => {
    if (!roomId) return null;
    return (uid: string, n: string, text: string) =>
      updateDoc(doc(db, "rooms", roomId, "guesses", uid), {
        [`words.${n}`]: text.slice(0, 24),
      }).catch(() => {});
  }, [roomId]);

  return { guesses, setWord };
}

/** All eight keywords. Rules refuse this until the game is over. */
export function useFinalKeys(roomId: string | null, over: boolean) {
  const [keys, setKeys] = useState<Record<TeamId, string[]> | null>(null);
  useEffect(() => {
    if (!roomId || !over) { setKeys(null); return; }
    return onSnapshot(
      doc(db, "rooms", roomId, "final", "keys"),
      (s) => setKeys(s.exists() ? (s.data() as Record<TeamId, string[]>) : null),
      () => setKeys(null)
    );
  }, [roomId, over]);
  return keys;
}

/**
 * The encryptor's device draws its own code, so no other browser — not
 * even the host's — ever holds it.
 */
export function useEnsureCode(
  roomId: string | null, team: TeamId | null, round: number,
  isEncryptor: boolean, phase: string
) {
  useEffect(() => {
    if (!roomId || !team || !round || !isEncryptor) return;
    if (phase !== "encrypt" && phase !== "keys") return;
    ensureCode(roomId, team, round).catch(() => {});
  }, [roomId, team, round, isEncryptor, phase]);
}

export function useRounds(roomId: string | null) {
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  useEffect(() => {
    if (!roomId) return;
    return onSnapshot(
      query(collection(db, "rooms", roomId, "rounds"), orderBy("round")),
      (s) => setRounds(s.docs.map((d) => d.data() as RoundRecord)),
      () => setRounds([])
    );
  }, [roomId]);
  return rounds;
}

export function useAway(roomId: string | null, round: number) {
  const [away, setAway] = useState<AwayRecord[]>([]);
  useEffect(() => {
    if (!roomId) return;
    return onSnapshot(
      collection(db, "rooms", roomId, "away"),
      (s) => setAway(s.docs.map((d) => d.data() as AwayRecord).filter((a) => a.round === round)),
      () => setAway([])
    );
  }, [roomId, round]);
  return away;
}

/* ------------------------------------------------------------------ */
/* countdown                                                          */
/* ------------------------------------------------------------------ */

/**
 * Counts down against the server's absolute deadline rather than a
 * local duration, so a backgrounded phone catches up instantly instead
 * of drifting further behind every round.
 */
export function useCountdown(room: Room | null) {
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);

  useEffect(() => {
    if (!room?.phaseStartedAt) return;
    // Network latency makes this slightly negative, which errs towards
    // firing late. Late is safe; early gets rejected by the server.
    offset.current = room.phaseStartedAt - Date.now();
  }, [room?.phaseStartedAt]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!room || room.phaseEndsAt == null) {
    return { remaining: null, total: null, pct: 1, expired: false };
  }
  const serverNow = now + offset.current;
  const total = Math.max(1, room.phaseEndsAt - room.phaseStartedAt);
  const remaining = Math.max(0, room.phaseEndsAt - serverNow);
  return {
    remaining: room.paused ? null : remaining,
    total,
    pct: Math.max(0, Math.min(1, remaining / total)),
    expired: !room.paused && remaining <= 0,
  };
}

/**
 * Drives the phase machine. The host fires the moment the clock runs
 * out; everyone else waits two seconds and fires as a backstop, so a
 * locked host phone can't freeze the table. The server ignores
 * duplicates.
 */
export function usePhaseDriver(room: Room | null, uid: string | null) {
  const { expired } = useCountdown(room);
  const fired = useRef<string>("");

  useEffect(() => {
    if (!room || !uid || !expired || room.paused) return;
    if (room.phase === "lobby" || room.phase === "over") return;
    const stamp = `${room.phase}:${room.round}`;
    if (fired.current === stamp) return;
    fired.current = stamp;

    const delay = room.hostUid === uid ? 0 : 2000;
    const t = setTimeout(() => {
      api.advancePhase({ roomId: room.id, fromPhase: room.phase, fromRound: room.round })
        .catch(() => { fired.current = ""; });
    }, delay);
    return () => clearTimeout(t);
  }, [room, uid, expired]);
}

/**
 * Ends a phase early once there's nothing left to wait for.
 *
 * A client can only see its own team's readiness, so this retries on an
 * interval rather than firing once: the server rejects the call until
 * both teams are done, and the next tick succeeds. It's also the only
 * thing that moves the game along when the host has turned the timer off.
 */
export function useAutoAdvance(room: Room | null, locallyDone: boolean) {
  useEffect(() => {
    if (!room || !locallyDone) return;
    if (room.phase !== "encrypt" && room.phase !== "guess") return;
    if (room.paused) return;

    const phase = room.phase;
    const round = room.round;
    const attempt = () =>
      api.advancePhase({ roomId: room.id, fromPhase: phase, fromRound: round }).catch(() => {});

    const first = setTimeout(attempt, 700);
    const repeat = setInterval(attempt, 2500);
    return () => { clearTimeout(first); clearInterval(repeat); };
  }, [room?.id, room?.phase, room?.round, room?.paused, locallyDone]);
}

/* ------------------------------------------------------------------ */
/* away tracking                                                      */
/* ------------------------------------------------------------------ */

/**
 * Records leaving the page during the phases where it matters.
 *
 * Note on screenshots: no browser fires an event for them. iOS and
 * Android expose that only to native apps. This tracks the thing that
 * is actually detectable — and is also the real cheating route, since
 * looking a word up means leaving the page.
 */
export function useAwayTracker(
  roomId: string | null,
  round: number,
  uid: string | null,
  active: boolean
) {
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    if (!roomId || !uid || !round || !active) return;
    const ref = doc(db, "rooms", roomId, "away", `${round}_${uid}`);

    const gone = () => { if (leftAt.current === null) leftAt.current = Date.now(); };
    const back = () => {
      if (leftAt.current === null) return;
      const ms = Date.now() - leftAt.current;
      leftAt.current = null;
      if (ms < 1000) return; // a notification banner shouldn't count
      setDoc(ref, { uid, round, count: increment(1), ms: increment(ms) }, { merge: true })
        .catch(() => {});
    };

    const onVis = () => (document.visibilityState === "hidden" ? gone() : back());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", gone);
    window.addEventListener("focus", back);
    return () => {
      back();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", gone);
      window.removeEventListener("focus", back);
    };
  }, [roomId, round, uid, active]);
}

/* ------------------------------------------------------------------ */
/* local identity                                                     */
/* ------------------------------------------------------------------ */

export function useLocal<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
  }, [key, v]);
  return [v, setV] as const;
}
