export type TeamId = "gold" | "silver";

export type Phase =
  | "lobby" | "keys" | "encrypt" | "guess" | "reveal" | "roundEnd" | "over";

export const OTHER: Record<TeamId, TeamId> = { gold: "silver", silver: "gold" };
export const TEAMS: TeamId[] = ["gold", "silver"];

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
  phase: Phase;
  round: number;
  suddenDeath: boolean;
  paused: boolean;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  settings: Settings;
  players: Record<string, Player>;
  teams: Record<TeamId, TeamState>;
  clues: Record<TeamId, string[] | null>;
  cluesIn: Record<TeamId, boolean>;
  encryptor: Record<TeamId, string | null>;
  winner: TeamId | "draw" | null;
  endReason: "breach" | "opponentFault" | "points" | "exhausted" | "abandoned" | null;
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
  /** uid of whoever sent it, or null while still open */
  submitted: string | null;
}

/** One player's running theory about the opponent's four words. */
export interface PlayerGuess {
  uid: string;
  team: TeamId;
  members: string[];
  words: Record<string, string>;
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
