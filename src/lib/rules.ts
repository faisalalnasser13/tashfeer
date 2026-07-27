/**
 * Pure game rules. No Firebase in this file, so it can be unit tested
 * and imported by the client for previews.
 */

export type TeamId = "gold" | "silver";
export type Phase =
  | "lobby"
  | "keys"     // 12s look at your four keys
  | "encrypt"  // both encryptors write clues
  | "guess"    // everyone decrypts + intercepts, simultaneously
  | "reveal"   // choreographed reveal
  | "roundEnd" // scoreboard + who left the screen
  | "over";

export const OTHER: Record<TeamId, TeamId> = { gold: "silver", silver: "gold" };
export const TEAMS: TeamId[] = ["gold", "silver"];

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
  suddenDeath: boolean;
  paused: boolean;
  phaseEndsAt: number | null;
  settings: Settings;
  players: Record<string, Player>;
  teams: Record<TeamId, TeamState>;
  /** clues are null until the guess phase publishes them */
  clues: Record<TeamId, string[] | null>;
  cluesIn: Record<TeamId, boolean>;
  encryptor: Record<TeamId, string | null>;
  winner: TeamId | "draw" | null;
  endReason: EndReason | null;
  createdAt: number;
  updatedAt: number;
}

export type EndReason =
  | "breach"       // won by two interceptions
  | "opponentFault" // won because they misread twice
  | "points"       // tiebreak on points
  | "exhausted"    // sudden death ran out
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

export interface Verdict {
  done: boolean;
  winner?: TeamId | "draw";
  reason?: EndReason;
  suddenDeath?: boolean;
}

/**
 * Decide whether the game is over after a round has been scored.
 *
 * Order matters. A clean single condition resolves directly; anything
 * tangled (both teams win at once, a team that both wins and loses,
 * or the round limit) falls through to points, and a points tie sends
 * the game to sudden death.
 */
export function evaluate(
  gold: Score,
  silver: Score,
  round: number,
  settings: Settings,
  suddenDeath: boolean
): Verdict {
  const gDec = gold.breach >= 2 || gold.fault >= 2;
  const lDec = silver.breach >= 2 || silver.fault >= 2;
  const limitHit = round >= settings.maxRounds;

  if (!gDec && !lDec && !limitHit && !suddenDeath) return { done: false };

  const gWin = gold.breach >= 2 && gold.fault < 2;
  const lWin = silver.breach >= 2 && silver.fault < 2;
  const gLose = gold.fault >= 2 && gold.breach < 2;
  const lLose = silver.fault >= 2 && silver.breach < 2;

  if (gWin && !lWin) return { done: true, winner: "gold", reason: "breach" };
  if (lWin && !gWin) return { done: true, winner: "silver", reason: "breach" };
  if (gLose && !lLose) return { done: true, winner: "silver", reason: "opponentFault" };
  if (lLose && !gLose) return { done: true, winner: "gold", reason: "opponentFault" };

  const gp = points(gold);
  const lp = points(silver);
  if (gp > lp) return { done: true, winner: "gold", reason: "points" };
  if (lp > gp) return { done: true, winner: "silver", reason: "points" };

  // Dead level. Keep playing until someone pulls ahead.
  const hardCap = settings.maxRounds + 4;
  if (round >= hardCap) return { done: true, winner: "draw", reason: "exhausted" };
  return { done: false, suddenDeath: true };
}
