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
    <div className="grid grid-cols-4 gap-1.5">
      {lanes.map((lane) => {
        const known = lane.label;
        const remote = theories?.[String(lane.n)] ?? "";
        const editable = Boolean(onGuess) && !known;

        return (
          <div
            key={lane.n}
            className={`card flex flex-col min-w-0 ${dense ? "p-1.5" : "p-2"}`}
            style={{ borderColor: `${color}30` }}
          >
            <span
              className={`num font-semibold mx-auto grid place-items-center rounded-md shrink-0 ${
                dense ? "text-[11px] w-5 h-5 mb-1" : "text-[12px] w-5 h-5 mb-1"
              }`}
              style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}
            >
              {lane.n}
            </span>

            {known ? (
              <p
                className={`text-center font-medium leading-tight mb-1 px-0.5 ${
                  dense ? "text-[11px]" : "text-[12px]"
                }`}
                style={{ color }}
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
              <p className="text-center font-medium mb-1 text-[11px]" style={{ color: remote ? color : undefined }}>
                <span className={remote ? "" : "text-muted"}>{remote || "—"}</span>
                <span style={{ color }} aria-hidden>؟</span>
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
        className="w-full min-w-0 bg-[#1B1A14] border border-line rounded-md text-center
                   font-medium text-[11px] text-parch pe-3.5
                   focus:border-gold focus:outline-none transition py-1 px-0.5
                   placeholder:text-muted/50"
        style={{ color: value ? color : undefined, borderColor: `${color}55` }}
        aria-label={`تخمين الكلمة ${n}`}
      />
      <span
        className="pointer-events-none absolute top-1/2 -translate-y-1/2
                   text-[11px] font-medium"
        style={{ color, insetInlineEnd: "0.35rem" }}
        aria-hidden
      >
        ؟
      </span>
    </div>
  );
}
