/**
 * Pure game rules. No Firebase in this file, so it can be unit tested
 * and imported by the client for previews.
 */

import { normalizeAr } from "./arabic";

export type TeamId = "gold" | "silver";
export type Phase =
  | "lobby"
  | "keys"     // keyword glance at deal
  | "encrypt"  // both encryptors write clues (simultaneous)
  | "guess"    // decrypt (+ intercept from r2); round 1 is simultaneous
  | "reveal"   // code(s) revealed and scored (10s)
  | "roundEnd" // scoreboard after both halves
  | "showdown" // tied on points — both teams name the opponent's four words
  | "over";

export const OTHER: Record<TeamId, TeamId> = { gold: "silver", silver: "gold" };
export const TEAMS: TeamId[] = ["gold", "silver"];
export const HALF_ORDER: TeamId[] = ["gold", "silver"];

export interface Score {
  /** اختراق — you cracked the opponent's code. Two of these wins. */
  breach: number;
  /** خلل — your own team misread you. Two of these loses. */
  fault: number;
}

export interface Player {
  name: string;
  avatar: number;
  team: TeamId | null;
  joinedAt: number;
}

export interface Settings {
  encryptSecs: number;
  guessSecs: number;
  maxRounds: number;
  useTimer: boolean;
}

export interface TeamState {
  score: Score;
  members: string[];
  /** index into members for whose turn it is to encrypt */
  encryptorIdx: number;
}

export interface Room {
  id: string;
  hostUid: string;
  phase: Phase;
  round: number;
  /** True once a points tie commits the table to a showdown. */
  showdown: boolean;
  paused: boolean;
  phaseEndsAt: number | null;
  settings: Settings;
  players: Record<string, Player>;
  teams: Record<TeamId, TeamState>;
  /** clues publish when that team's half begins */
  clues: Record<TeamId, string[] | null>;
  cluesIn: Record<TeamId, boolean>;
  showdownIn: Record<TeamId, boolean>;
  /** Cumulative encrypt + decrypt submit elapsed ms (lower wins a showdown tie). */
  submitMs: Record<TeamId, number>;
  encryptor: Record<TeamId, string | null>;
  activeTeam: TeamId | null;
  winner: TeamId | "draw" | null;
  endReason: EndReason | null;
  /** Persisted at showdown resolution for the over screen (guesses are team-scoped). */
  showdownHits?: Record<TeamId, number> | null;
  showdownGuesses?: Record<TeamId, string[]> | null;
  showdownTimeBreak?: boolean;
  createdAt: number;
  updatedAt: number;
  phaseStartedAt?: number;
}

export type EndReason =
  | "breach"       // won by two interceptions
  | "opponentFault" // won because they misread twice
  | "points"       // tiebreak on points
  | "showdown"     // settled by naming the opponent's keywords
  | "exhausted"    // legacy — sudden death hard-cap (no longer produced)
  | "abandoned";

export interface RoundRecord {
  round: number;
  suddenDeath: boolean;
  data: Record<
    TeamId,
    {
      encryptorUid: string | null;
      clues: string[];
      code: number[];
      /** what this team guessed about its OWN code */
      decrypt: (number | null)[];
      /** what the OPPONENT guessed about this team's code */
      intercept: (number | null)[];
      noClues: boolean;
      faulted: boolean;    // this team earned a خلل
      wasBreached: boolean; // opponent earned an اختراق off this code
    }
  >;
  at: number;
}

/* ------------------------------------------------------------------ */
/* codes                                                              */
/* ------------------------------------------------------------------ */

/** All 24 ordered 3-digit codes drawn from 1..4 without repetition. */
export function allCodes(): number[][] {
  const out: number[][] = [];
  for (let a = 1; a <= 4; a++)
    for (let b = 1; b <= 4; b++)
      for (let c = 1; c <= 4; c++)
        if (a !== b && b !== c && a !== c) out.push([a, b, c]);
  return out;
}

/** Firestore rejects nested arrays, so the deck is stored as strings. */
export function encodeCode(code: number[]): string {
  return code.join("");
}

export function decodeCode(raw: string | number[]): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  return String(raw).split("").map(Number);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function codesEqual(a: (number | null)[], b: (number | null)[]): boolean {
  if (!a || !b || a.length !== 3 || b.length !== 3) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/* ------------------------------------------------------------------ */
/* scoring                                                            */
/* ------------------------------------------------------------------ */

export function points(s: Score): number {
  return s.breach - s.fault;
}

/**
 * Why the table entered the points / showdown tiebreak path.
 * Null when a clean breach or opponentFault already decided the game.
 */
export type TiebreakTrigger =
  | "mixed"       // a team hit 2 اختراق and 2 خلل at once
  | "bothBreach"  // both teams collected their second interception
  | "bothFault"   // both teams collected their second miscommunication
  | "lastRound";  // last round ended with no decisive win/loss

export function tiebreakTrigger(
  gold: Score,
  silver: Score,
  round: number,
  maxRounds: number,
): TiebreakTrigger | null {
  const gMixed = gold.breach >= 2 && gold.fault >= 2;
  const sMixed = silver.breach >= 2 && silver.fault >= 2;
  if (gMixed || sMixed) return "mixed";

  const gWin = gold.breach >= 2 && gold.fault < 2;
  const sWin = silver.breach >= 2 && silver.fault < 2;
  const gLose = gold.fault >= 2 && gold.breach < 2;
  const sLose = silver.fault >= 2 && silver.breach < 2;

  if ((gWin && !sWin) || (sWin && !gWin) || (gLose && !sLose) || (sLose && !gLose)) {
    return null;
  }

  if (gWin && sWin) return "bothBreach";
  if (gLose && sLose) return "bothFault";
  return "lastRound";
}

export interface Verdict {
  done: boolean;
  winner?: TeamId | "draw";
  reason?: EndReason;
  showdown?: boolean;
}

/**
 * Decide whether the game is over after a round has been scored.
 *
 * Order matters. A clean single condition resolves directly; anything
 * tangled (both teams win at once, a team that both wins and loses,
 * or the round limit) falls through to points, and a points tie sends
 * the game to showdown.
 */
export function evaluate(
  gold: Score,
  silver: Score,
  round: number,
  settings: Settings,
  showdown: boolean
): Verdict {
  const gDec = gold.breach >= 2 || gold.fault >= 2;
  const lDec = silver.breach >= 2 || silver.fault >= 2;
  const limitHit = round >= settings.maxRounds;

  // Already committed to resolving (showdown queued) — evaluate rather than continue.
  if (!gDec && !lDec && !limitHit && !showdown) return { done: false };

  const gWin = gold.breach >= 2 && gold.fault < 2;
  const lWin = silver.breach >= 2 && silver.fault < 2;
  const gLose = gold.fault >= 2 && gold.breach < 2;
  const lLose = silver.fault >= 2 && silver.breach < 2;

  if (gWin && !lWin) return { done: true, winner: "gold", reason: "breach" };
  if (lWin && !gWin) return { done: true, winner: "silver", reason: "breach" };
  if (gLose && !lLose) return { done: true, winner: "silver", reason: "opponentFault" };
  if (lLose && !gLose) return { done: true, winner: "gold", reason: "opponentFault" };

  // Tiebreak step 1: points (اختراق +1, خلل −1). Unequal → game over.
  const gp = points(gold);
  const lp = points(silver);
  if (gp > lp) return { done: true, winner: "gold", reason: "points" };
  if (lp > gp) return { done: true, winner: "silver", reason: "points" };

  // Tiebreak step 2: keyword showdown (then time, in the engine).
  return { done: false, showdown: true };
}

/**
 * Score the showdown: each team names the opponent's four keywords.
 * Comparison uses the same Arabic normalisation as repeated-clue checks.
 */
export function scoreShowdown(
  guesses: Record<TeamId, string[]>,
  keys: Record<TeamId, string[]>,
): { hits: Record<TeamId, number>; winner: TeamId | "draw" } {
  const hits: Record<TeamId, number> = { gold: 0, silver: 0 };
  for (const team of TEAMS) {
    const opp = OTHER[team];
    const guessed = guesses[team] || [];
    const actual = keys[opp] || [];
    for (let i = 0; i < 4; i++) {
      const g = normalizeAr(guessed[i] || "");
      const k = normalizeAr(actual[i] || "");
      if (g && k && g === k) hits[team] += 1;
    }
  }
  if (hits.gold > hits.silver) return { hits, winner: "gold" };
  if (hits.silver > hits.gold) return { hits, winner: "silver" };
  return { hits, winner: "draw" };
}
