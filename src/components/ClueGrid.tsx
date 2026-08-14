import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang, RoundRecord, TeamId } from "../lib/types";
import { TEAM_HEX } from "./ui";
import { S } from "../lib/strings";

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

/** One watch (round) × four digit columns — empty cell = digit unused that round. */
function matrixFromLanes(lanes: Lane[]): { round: number; cells: (string | null)[] }[] {
  const roundSet = new Set<number>();
  for (const lane of lanes) {
    for (const c of lane.clues) roundSet.add(c.round);
  }
  const rounds = [...roundSet].sort((a, b) => a - b);
  return rounds.map((round) => ({
    round,
    cells: lanes.map(
      (lane) => lane.clues.find((c) => c.round === round)?.text ?? null
    ),
  }));
}

/**
 * Ruled watch sheet: header band (digit + keyword), gutter of watch numbers,
 * four hairline-separated columns. A crowded column is an overused number;
 * a word repeating down one column is the crib that gave you away.
 */
export function ClueGrid({
  lanes, team, theories, onGuess, declassified, lang = "ar",
}: {
  lanes: Lane[];
  team: TeamId;
  theories?: Record<string, string>;
  onGuess?: (n: string, text: string) => void;
  /** End screen: keys are unsealed — classification stamp moves to the records hero. */
  declassified?: boolean;
  lang?: Lang;
}) {
  const color = TEAM_HEX[team];
  const rows = useMemo(() => matrixFromLanes(lanes), [lanes]);
  const dense = rows.length > 5;
  const s = S(lang);

  return (
    <div
      className="watch-sheet"
      style={{ ["--watch-team" as string]: color }}
      role="table"
      aria-label={s.logTitle(s.team[team])}
    >
      <div className="watch-sheet-meta">
        {/* RTL: first → visual right, last → visual left */}
        <span className="watch-sheet-form num">{s.formLg4}</span>
        <span className="watch-sheet-title">{s.logTitle(s.team[team])}</span>
      </div>

      <div className="watch-sheet-grid" role="rowgroup">
        <div className="watch-sheet-header" role="row">
          {/* Gutter first → visual right under dir=rtl */}
          <div className="watch-sheet-gutter watch-sheet-gutter-head" role="columnheader">
            <span className="num">{s.watchGutter}</span>
          </div>
          {lanes.map((lane) => {
            const known = lane.label;
            const remote = theories?.[String(lane.n)] ?? "";
            const editable = Boolean(onGuess) && !known;
            return (
              <div key={lane.n} className="watch-sheet-colhead" role="columnheader">
                <span className="num slot-digit watch-sheet-digit">{lane.n}</span>
                {known ? (
                  <p className="watch-sheet-word" title={known}>
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
                  <p className={`watch-sheet-guess ${remote ? "" : "watch-sheet-empty"}`}>
                    <span>{remote || s.empty}</span>
                    <span aria-hidden>{s.qmark}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <p className="watch-sheet-empty-msg">{s.noWatches}</p>
        ) : (
          rows.map((row) => (
            <div key={row.round} className={`watch-sheet-row ${dense ? "watch-sheet-row-dense" : ""}`} role="row">
              <div className="watch-sheet-gutter" role="rowheader">
                <span className="num">{row.round}</span>
              </div>
              {row.cells.map((text, i) => (
                <div
                  key={i}
                  className={[
                    "watch-sheet-cell",
                    text ? "" : "watch-sheet-cell-blank",
                  ].filter(Boolean).join(" ")}
                  role="cell"
                  title={text ? s.usedRound(row.round, text) : s.unusedRound(row.round)}
                >
                  {text ?? ""}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="watch-sheet-footer">
        <span className="watch-sheet-footer-note">{s.endOfLog}</span>
        {!declassified && (
          <span className="watch-sheet-secret">{s.topSecret}</span>
        )}
      </div>
    </div>
  );
}

/**
 * After focus, keep the field in view inside `.scroll-y`. Mobile browsers
 * often scroll a clipped/overflow ancestor (the sheet header) to the top of
 * the visual viewport instead — `nearest` corrects without the encrypt-only
 * holdScroll cancel that buries fields under the Android keyboard.
 */
export function pinTheoryFieldInView(el: HTMLElement) {
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/**
 * Local draft so keystrokes paint immediately; Firestore is async.
 * While focused, ignore remote overwrites so a lagging snapshot can't
 * wipe the caret. Used by the log theory sheet and the showdown inputs.
 */
export function SharedGuessInput({
  n, remote, color, onGuess, disabled, className,   placeholder = "—", showQMark = true, lang = "ar",
}: {
  n: number | string;
  remote: string;
  color?: string;
  onGuess: (n: string, text: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  showQMark?: boolean;
  lang?: Lang;
}) {
  const [value, setValue] = useState(remote);
  const focused = useRef(false);
  const s = S(lang);

  useEffect(() => {
    if (!focused.current) setValue(remote);
  }, [remote]);

  return (
    <div className="relative w-full">
      <input
        value={value}
        disabled={disabled}
        onFocus={(e) => {
          focused.current = true;
          const el = e.currentTarget;
          requestAnimationFrame(() => pinTheoryFieldInView(el));
          // Keyboard resize settles after focus; one delayed pass is enough.
          window.setTimeout(() => {
            if (focused.current) pinTheoryFieldInView(el);
          }, 120);
        }}
        onBlur={() => { focused.current = false; }}
        onChange={(e) => {
          const t = e.target.value.slice(0, 24);
          setValue(t);
          onGuess(String(n), t);
        }}
        placeholder={placeholder}
        maxLength={24}
        className={className ?? "watch-sheet-input"}
        style={{ color: value && color ? color : undefined, fontSize: "16px" }}
        aria-label={s.guessWordN(n)}
      />
      {showQMark && (
        <span className="watch-sheet-qmark" style={{ color }} aria-hidden>
          {s.qmark}
        </span>
      )}
    </div>
  );
}
