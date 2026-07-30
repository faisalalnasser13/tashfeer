import { useEffect, useMemo, useRef, useState } from "react";
import {
  doc, collection, onSnapshot, setDoc, updateDoc, increment, query, orderBy,
} from "firebase/firestore";
import { db, api } from "./firebase";
import { ensureCode, TIMER_GRACE_MS, TIMER_START_GRACE_MS } from "./engine";
import type { AwayRecord, Draft, Room, RoundRecord, TeamId } from "./types";

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
 *
 * Retries on error — a permission blip at deal time used to kill the
 * listener forever until refresh.
 */
export function useTeamPrivate(roomId: string | null, team: TeamId | null) {
  const [data, setData] = useState<{
    keys: string[];
    usedClues: string[];
    theories: Record<string, string>;
  } | null>(null);
  useEffect(() => {
    if (!roomId || !team) { setData(null); return; }

    let cancelled = false;
    let unsub: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const subscribe = () => {
      if (cancelled) return;
      unsub = onSnapshot(
        doc(db, "rooms", roomId, "private", team),
        (s) => {
          attempt = 0;
          setData(
            s.exists()
              ? {
                  keys: (s.data().keys as string[]) ?? [],
                  usedClues: (s.data().usedClues as string[]) ?? [],
                  theories: (s.data().theories as Record<string, string>) ?? {
                    "1": "", "2": "", "3": "", "4": "",
                  },
                }
              : null
          );
        },
        () => {
          setData(null);
          if (cancelled) return;
          const delay = Math.min(8_000, 300 * 2 ** attempt);
          attempt += 1;
          retryTimer = setTimeout(() => {
            unsub?.();
            subscribe();
          }, delay);
        }
      );
    };

    subscribe();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsub?.();
    };
  }, [roomId, team]);

  /** Shared opponent-word theory — lives on private/{team}, readable by the team. */
  const setTheory = useMemo(() => {
    if (!roomId || !team) return null;
    return (n: string, text: string) =>
      updateDoc(doc(db, "rooms", roomId, "private", team), {
        [`theories.${n}`]: text.slice(0, 24),
      }).catch(() => {});
  }, [roomId, team]);

  return { data, setTheory };
}

/** The round's code (+ submitted clues). Only this round's encryptor can read it. */
export function useCode(roomId: string | null, team: TeamId | null, round: number, isEncryptor: boolean) {
  const [state, setState] = useState<{ code: number[] | null; clues: string[] | null }>({
    code: null, clues: null,
  });
  useEffect(() => {
    if (!roomId || !team || !round || !isEncryptor) {
      setState({ code: null, clues: null });
      return;
    }
    return onSnapshot(
      doc(db, "rooms", roomId, "secret", `${team}_r${round}`),
      (s) => {
        if (!s.exists()) {
          setState({ code: null, clues: null });
          ensureCode(roomId, team, round).catch(() => {});
          return;
        }
        const data = s.data();
        const c = data.code as number[] | undefined;
        const clues = data.clues as string[] | undefined;
        setState({
          code: c && c.length === 3 ? c : null,
          clues: clues && clues.length === 3 ? clues : null,
        });
        if (!c || c.length !== 3) ensureCode(roomId, team, round).catch(() => {});
      },
      () => {
        setState({ code: null, clues: null });
        ensureCode(roomId, team, round).catch(() => {});
      }
    );
  }, [roomId, team, round, isEncryptor]);
  return state;
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
    // Serialise writes so a fast second tap can't overwrite an in-flight first.
    let chain: Promise<unknown> = Promise.resolve();
    const write = (payload: Record<string, unknown>) => {
      const p = chain.then(() => updateDoc(ref, payload));
      // Keep the queue moving even if one write fails.
      chain = p.catch(() => {});
      return p;
    };
    return {
      /**
       * One write per interaction. Assigning a digit can clear it from
       * another slot, and sending those as two writes loses the clear.
       */
      setCode: (field: "decrypt" | "intercept", values: (number | null)[]) =>
        write({ [field]: values }),
      /** Whoever taps first locks that field. Role depends on the half. */
      submit: (uid: string, field: "decrypt" | "intercept") =>
        write(field === "decrypt" ? { submittedDecrypt: uid } : { submittedIntercept: uid }),
    };
  }, [path]);

  return { draft, actions };
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
 * The encryptor's device draws its own code. Retries a few times so a
 * dropped write doesn't leave the cartouche blank until a refresh.
 */
export function useEnsureCode(
  roomId: string | null, team: TeamId | null, round: number,
  isEncryptor: boolean, phase: string
) {
  useEffect(() => {
    if (!roomId || !team || !round || !isEncryptor) return;
    if (phase !== "encrypt" && phase !== "keys") return;

    let cancelled = false;
    (async () => {
      for (let i = 0; i < 6 && !cancelled; i++) {
        try {
          await ensureCode(roomId, team, round);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 350 * (i + 1)));
        }
      }
    })();
    return () => { cancelled = true; };
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
 * Counts down against the absolute `phaseEndsAt` deadline.
 *
 * On encrypt/guess: a short start grace keeps the visible clock full,
 * then digits drain to 0:00 at `phaseEndsAt`, then a hidden end grace
 * (`TIMER_GRACE_MS`) runs before `expired` flips. Transition beats
 * (keys / reveal / roundEnd) expire exactly at the deadline.
 */
export function useCountdown(room: Room | null) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!room || room.phaseEndsAt == null) {
    return { remaining: null, total: null, pct: 1, expired: false };
  }

  const playPhase = room.phase === "encrypt" || room.phase === "guess";
  const startGrace = playPhase ? TIMER_START_GRACE_MS : 0;
  const total = Math.max(1, room.phaseEndsAt - room.phaseStartedAt - startGrace);
  // Cap at `total` so the first startGrace ms show a frozen full clock.
  const remaining = Math.max(0, Math.min(total, room.phaseEndsAt - now));
  const endGrace = playPhase ? TIMER_GRACE_MS : 0;
  return {
    remaining: room.paused ? null : remaining,
    total,
    pct: Math.max(0, Math.min(1, remaining / total)),
    expired: !room.paused && now >= room.phaseEndsAt + endGrace,
  };
}

/**
 * Drives the phase machine. The host fires the moment the clock runs
 * out; everyone else waits two seconds and fires as a backstop, so a
 * locked host phone can't freeze the table. The server ignores
 * duplicates.
 *
 * `fired` only marks an in-flight / completed attempt. Cleanup of a
 * cancelled timeout must clear it — otherwise a room snapshot (addTime,
 * cluesIn, join) between arming and fire leaves the phase stuck until
 * refresh.
 */
export function usePhaseDriver(room: Room | null, uid: string | null) {
  const { expired } = useCountdown(room);
  const fired = useRef<string>("");
  const inFlight = useRef(false);

  const roomId = room?.id ?? null;
  const phase = room?.phase ?? null;
  const round = room?.round ?? null;
  const paused = room?.paused ?? false;
  const hostUid = room?.hostUid ?? null;

  useEffect(() => {
    if (!roomId || !uid || !expired || paused) return;
    if (phase === "lobby" || phase === "over" || !phase || round == null) return;
    const stamp = `${phase}:${round}`;
    if (fired.current === stamp) return;

    fired.current = stamp;
    const delay = hostUid === uid ? 0 : 2000;
    let started = false;
    const t = setTimeout(() => {
      started = true;
      inFlight.current = true;
      api.advancePhase({ roomId, fromPhase: phase, fromRound: round })
        .catch(() => { fired.current = ""; })
        .finally(() => { inFlight.current = false; });
    }, delay);

    return () => {
      clearTimeout(t);
      // Cancelled before the call began — allow re-arm on the next pass
      // (same stamp after +30s, or after a mid-wait room snapshot).
      if (!started && !inFlight.current && fired.current === stamp) {
        fired.current = "";
      }
    };
  }, [roomId, phase, round, paused, hostUid, uid, expired]);
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

function readLocal<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : initial;
  } catch {
    return initial;
  }
}

/**
 * Persists `v` under `key`. Re-reads when `key` changes — the mount-only
 * useState initializer would otherwise keep the previous value and the
 * write effect would stamp it onto the new key.
 */
export function useLocal<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => readLocal(key, initial));
  const [storedKey, setStoredKey] = useState(key);

  if (key !== storedKey) {
    setStoredKey(key);
    setV(readLocal(key, initial));
  }

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
  }, [key, v]);
  return [v, setV] as const;
}
