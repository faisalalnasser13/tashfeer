import type { PlayerGuess, RoundRecord, TeamId } from "../lib/types";
import { TEAM_HEX } from "./ui";

export interface Lane {
  n: number;
  label: string | null; // the keyword, or null when it's the opponent's
  clues: { text: string; round: number }[];
}

/**
 * Every clue ever given, filed under the number it turned out to mean.
 * This is where the game is actually played — physical Decrypto players
 * fight over the note sheet for exactly this reason.
 */
export function buildLanes(
  rounds: RoundRecord[],
  team: TeamId,
  keys: string[] | null
): Lane[] {
  const lanes: Lane[] = [1, 2, 3, 4].map((n) => ({
    n,
    label: keys ? keys[n - 1] ?? null : null,
    clues: [],
  }));
  for (const r of rounds) {
    const side = r.data?.[team];
    if (!side || side.noClues) continue;
    side.clues.forEach((text, i) => {
      const n = side.code[i];
      if (n >= 1 && n <= 4) lanes[n - 1].clues.push({ text, round: r.round });
    });
  }
  return lanes;
}

/**
 * Four columns: digit + word/guess on top, clue history stacked under.
 * Opponent columns are editable when `onGuess` is set — one shared theory
 * per digit for the whole team.
 */
export function ClueGrid({
  lanes, team, guesses, onGuess,
}: {
  lanes: Lane[];
  team: TeamId;
  guesses?: PlayerGuess[];
  onGuess?: (n: string, text: string) => void;
}) {
  const color = TEAM_HEX[team];
  const dense = lanes.some((l) => l.clues.length > 4);

  /** Shared team theory for a digit — any non-empty sheet wins (they sync). */
  function teamWord(n: number): string {
    for (const g of guesses ?? []) {
      const w = (g.words?.[String(n)] ?? "").trim();
      if (w) return w;
    }
    return "";
  }

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {lanes.map((lane) => {
        const known = lane.label;
        const guess = teamWord(lane.n);
        const editable = Boolean(onGuess) && !known;

        return (
          <div
            key={lane.n}
            className={`card flex flex-col min-w-0 ${dense ? "p-1.5" : "p-2"}`}
            style={{ borderColor: `${color}30` }}
          >
            <span
              className={`num font-semibold mx-auto grid place-items-center rounded-md shrink-0 ${
                dense ? "text-[12px] w-5 h-5 mb-1" : "text-[14px] w-6 h-6 mb-1.5"
              }`}
              style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}
            >
              {lane.n}
            </span>

            {known ? (
              <p
                className={`text-center font-medium leading-tight mb-1.5 px-0.5 ${
                  dense ? "text-[13px]" : "text-[15px]"
                }`}
                style={{ color }}
                title={known}
              >
                {known}
              </p>
            ) : editable ? (
              <input
                value={guess}
                onChange={(e) => onGuess?.(String(lane.n), e.target.value)}
                placeholder="؟"
                maxLength={24}
                className={`w-full bg-[#1B1A14] border border-line rounded-md text-center
                            font-medium text-parch placeholder:text-muted/80
                            focus:border-gold focus:outline-none transition mb-1.5
                            ${dense ? "text-[13px] py-1 px-0.5" : "text-[15px] py-1.5 px-1"}`}
                style={{ color: guess ? color : undefined }}
                aria-label={`تخمين الكلمة ${lane.n}`}
              />
            ) : (
              <p
                className={`text-center font-medium text-muted mb-1.5 ${
                  dense ? "text-[13px]" : "text-[15px]"
                }`}
              >
                {guess || "؟"}
              </p>
            )}

            <div className={`flex flex-col flex-1 min-h-0 ${dense ? "gap-0.5" : "gap-1"}`}>
              {lane.clues.length === 0 ? (
                <p className="text-[10px] text-muted/70 text-center leading-tight">—</p>
              ) : (
                lane.clues.map((c, i) => (
                  <div
                    key={i}
                    className={`rounded-sm border border-line/80 bg-[#1B1A14] text-center leading-snug ${
                      dense ? "px-0.5 py-0.5 text-[10px]" : "px-1 py-0.5 text-[11px]"
                    }`}
                    title={`ج${c.round}: ${c.text}`}
                  >
                    <span className="num text-muted text-[9px] block">{c.round}</span>
                    <span className="break-words">{c.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
