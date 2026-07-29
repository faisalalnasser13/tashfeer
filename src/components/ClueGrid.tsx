import { useEffect, useRef, useState } from "react";
import type { RoundRecord, TeamId } from "../lib/types";
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
 * per digit for the whole team (stored on private/{team}.theories).
 *
 * Visual: one lined notebook sheet with binder punches on the start edge.
 */
export function ClueGrid({
  lanes, team, theories, onGuess,
}: {
  lanes: Lane[];
  team: TeamId;
  theories?: Record<string, string>;
  onGuess?: (n: string, text: string) => void;
}) {
  const color = TEAM_HEX[team];
  const dense = lanes.some((l) => l.clues.length > 4);

  return (
    <div
      className="clue-sheet"
      style={{ ["--clue-team" as string]: color }}
    >
      <div className="clue-sheet-punches" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} className="clue-sheet-punch" />
        ))}
      </div>

      <div className="clue-sheet-cols">
        {lanes.map((lane) => {
          const known = lane.label;
          const remote = theories?.[String(lane.n)] ?? "";
          const editable = Boolean(onGuess) && !known;

          return (
            <div key={lane.n} className="clue-sheet-col">
              <span
                className={`clue-sheet-digit num font-semibold mx-auto grid place-items-center shrink-0 ${
                  dense ? "text-[11px] w-5 h-5 mb-1" : "text-[12px] w-5 h-5 mb-1"
                }`}
              >
                {lane.n}
              </span>

              {known ? (
                <p
                  className={`clue-sheet-word text-center font-medium leading-tight mb-1 px-0.5 ${
                    dense ? "text-[11px]" : "text-[12px]"
                  }`}
                  title={known}
                >
                  {known}
                </p>
              ) : editable ? (
                <SharedGuessInput
                  n={lane.n}
                  remote={remote}
                  color={color}
                  onGuess={onGuess!}
                />
              ) : (
                <p
                  className={`clue-sheet-word text-center font-medium mb-1 text-[11px] ${
                    remote ? "" : "clue-sheet-muted"
                  }`}
                >
                  <span>{remote || "—"}</span>
                  <span aria-hidden>؟</span>
                </p>
              )}

              <div className={`flex flex-col flex-1 min-h-0 ${dense ? "gap-0.5" : "gap-1"}`}>
                {lane.clues.length === 0 ? (
                  <p className="clue-sheet-muted text-[10px] text-center leading-tight">—</p>
                ) : (
                  lane.clues.map((c, i) => (
                    <div
                      key={i}
                      className={`clue-sheet-entry text-center leading-snug ${
                        dense ? "px-0.5 py-0.5 text-[10px]" : "px-1 py-0.5 text-[11px]"
                      }`}
                      title={`جولة ${c.round}: ${c.text}`}
                    >
                      <span className="num clue-sheet-round text-[9px] block">{c.round}</span>
                      <span className="break-words">{c.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Local draft so keystrokes paint immediately; Firestore is async.
 * While focused, ignore remote overwrites so a lagging snapshot can't
 * wipe the caret.
 */
function SharedGuessInput({
  n, remote, color, onGuess,
}: {
  n: number;
  remote: string;
  color: string;
  onGuess: (n: string, text: string) => void;
}) {
  const [value, setValue] = useState(remote);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setValue(remote);
  }, [remote]);

  return (
    <div className="relative mb-1">
      <input
        value={value}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; }}
        onChange={(e) => {
          const t = e.target.value.slice(0, 24);
          setValue(t);
          onGuess(String(n), t);
        }}
        placeholder="—"
        maxLength={24}
        className="clue-sheet-input w-full min-w-0 text-center font-medium text-[11px]
                   pe-3.5 focus:outline-none transition py-1 px-0.5"
        style={{ color: value ? color : undefined }}
        aria-label={`تخمين الكلمة ${n}`}
      />
      <span
        className="pointer-events-none absolute top-1/2 -translate-y-1/2
                   text-[11px] font-medium"
        style={{ color, insetInlineEnd: "0.2rem" }}
        aria-hidden
      >
        ؟
      </span>
    </div>
  );
}
