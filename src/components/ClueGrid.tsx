import { useEffect, useMemo, useRef, useState } from "react";
import type { RoundRecord, TeamId } from "../lib/types";
import { TEAM_HEX, TEAM_LABEL } from "./ui";

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
  lanes, team, theories, onGuess,
}: {
  lanes: Lane[];
  team: TeamId;
  theories?: Record<string, string>;
  onGuess?: (n: string, text: string) => void;
}) {
  const color = TEAM_HEX[team];
  const rows = useMemo(() => matrixFromLanes(lanes), [lanes]);
  const dense = rows.length > 5;

  return (
    <div
      className="watch-sheet"
      style={{ ["--watch-team" as string]: color }}
      role="table"
      aria-label={`سجل ${TEAM_LABEL[team]}`}
    >
      <div className="watch-sheet-meta">
        {/* RTL: first → visual right, last → visual left */}
        <span className="watch-sheet-form num">نموذج سج-٤</span>
        <span className="watch-sheet-title">سجل {TEAM_LABEL[team]}</span>
      </div>

      <div className="watch-sheet-grid" role="rowgroup">
        <div className="watch-sheet-header" role="row">
          {/* Gutter first → visual right under dir=rtl */}
          <div className="watch-sheet-gutter watch-sheet-gutter-head" role="columnheader">
            <span className="num">و</span>
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
                    <span>{remote || "—"}</span>
                    <span aria-hidden>؟</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <p className="watch-sheet-empty-msg">لا مراقبات بعد</p>
        ) : (
          rows.map((row) => (
            <div key={row.round} className={`watch-sheet-row ${dense ? "watch-sheet-row-dense" : ""}`} role="row">
              <div className="watch-sheet-gutter" role="rowheader">
                <span className="num">{row.round}</span>
              </div>
              {row.cells.map((text, i) => (
                <div
                  key={i}
                  className={`watch-sheet-cell ${text ? "" : "watch-sheet-cell-blank"}`}
                  role="cell"
                  title={text ? `جولة ${row.round}: ${text}` : `جولة ${row.round}: غير مستخدم`}
                >
                  {text ?? ""}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="watch-sheet-footer">
        <span className="watch-sheet-footer-note">نهاية السجل · لا يُتلف</span>
        <span className="watch-sheet-secret">سري للغاية</span>
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
    <div className="relative w-full">
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
        className="watch-sheet-input"
        style={{ color: value ? color : undefined }}
        aria-label={`تخمين الكلمة ${n}`}
      />
      <span className="watch-sheet-qmark" style={{ color }} aria-hidden>
        ؟
      </span>
    </div>
  );
}
