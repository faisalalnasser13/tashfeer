export type TeamId = "gold" | "silver";

export type Lang = "ar" | "en";

export type Phase =
  | "lobby" | "keys" | "encrypt" | "guess" | "reveal" | "roundEnd" | "showdown" | "over";

export const OTHER: Record<TeamId, TeamId> = { gold: "silver", silver: "gold" };
export const TEAMS: TeamId[] = ["gold", "silver"];

/** Official order: White (gold) first each round, then Black (silver). */
export const HALF_ORDER: TeamId[] = ["gold", "silver"];

export interface Score { breach: number; fault: number }

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
  encryptorIdx: number;
}

export interface Room {
  id: string;
  hostUid: string;
  /** Locked at create — never changes mid-game. Old rooms default to ar. */
  lang: Lang;
  phase: Phase;
  round: number;
  /** True once a points tie commits the table to a showdown. */
  showdown: boolean;
  paused: boolean;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  settings: Settings;
  players: Record<string, Player>;
  teams: Record<TeamId, TeamState>;
  /** Published clue sets — only the active half's clues need be live. */
  clues: Record<TeamId, string[] | null>;
  cluesIn: Record<TeamId, boolean>;
  showdownIn: Record<TeamId, boolean>;
  /** Cumulative encrypt + decrypt submit elapsed ms (lower wins a showdown hit-tie). */
  submitMs: Record<TeamId, number>;
  encryptor: Record<TeamId, string | null>;
  /**
   * Which team's code is being guessed / revealed right now.
   * Null outside guess/reveal, or during round-1 simultaneous guess/reveal
   * (both teams at once — no interception). From round 2, gold then silver.
   */
  activeTeam: TeamId | null;
  winner: TeamId | "draw" | null;
  endReason: "breach" | "opponentFault" | "points" | "showdown" | "exhausted" | "abandoned" | null;
  /** Written when showdown resolves — public so the over screen can show both sides. */
  showdownHits?: Record<TeamId, number> | null;
  showdownGuesses?: Record<TeamId, string[]> | null;
  showdownTimeBreak?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Draft {
  team: TeamId;
  round: number;
  members: string[];
  lockedFor: string | null;
  decrypt: (number | null)[];
  intercept: (number | null)[];
  /** uid who locked in this team's decryption of its own code */
  submittedDecrypt: string | null;
  /** uid who locked in this team's interception of the opponent */
  submittedIntercept: string | null;
  submittedDecryptAt?: number | null;
  submittedInterceptAt?: number | null;
}

/** One player's running theory about the opponent's four words. */
export interface PlayerGuess {
  uid: string;
  team: TeamId;
  members: string[];
  words: Record<string, string>;
  /** Wall-clock when the team locked in their showdown sheet. */
  submittedAt?: number | null;
}

export interface RoundSide {
  encryptorUid: string | null;
  clues: string[];
  code: number[];
  decrypt: (number | null)[];
  intercept: (number | null)[];
  noClues: boolean;
  faulted: boolean;
  wasBreached: boolean;
}

export interface RoundRecord {
  round: number;
  suddenDeath: boolean;
  at: number;
  data: Record<TeamId, RoundSide>;
}

export interface AwayRecord {
  uid: string;
  round: number;
  count: number;
  ms: number;
}
