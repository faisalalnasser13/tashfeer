import { useState } from "react";
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

export function ClueGrid({
  lanes, team, guesses, myUid, onGuess, names,
}: {
  lanes: Lane[];
  team: TeamId;
  /**
   * Every teammate's running theory about this grid's words. Only passed
   * for the opponent's grid — there's nothing to guess about your own.
   */
  guesses?: PlayerGuess[];
  myUid?: string;
  onGuess?: (n: string, text: string) => void;
  names?: Record<string, string>;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const color = TEAM_HEX[team];
  const mine = guesses?.find((g) => g.uid === myUid);

  /** Everyone who has written something for this number. */
  function opinions(n: number) {
    return (guesses ?? [])
      .map((g) => ({ uid: g.uid, word: (g.words?.[String(n)] ?? "").trim() }))
      .filter((o) => o.word.length > 0);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {lanes.map((lane) => {
        const expanded = open === lane.n;
        const shown = expanded ? lane.clues : lane.clues.slice(-3);
        const hidden = lane.clues.length - shown.length;
        return (
          <div
            key={lane.n}
            className={`card p-2.5 ${expanded ? "col-span-2" : ""}`}
            style={{ borderColor: `${color}30` }}
          >
            <button
              onClick={() => setOpen(expanded ? null : lane.n)}
              className="w-full flex items-center gap-2 text-start mb-2"
            >
              <span
                className="num font-display text-[17px] w-6 h-6 grid place-items-center rounded-md shrink-0"
                style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}
              >
                {lane.n}
              </span>
              <LaneTitle
                label={lane.label}
                mine={mine?.words?.[String(lane.n)] ?? ""}
                opinions={opinions(lane.n)}
                color={color}
              />
              <span className="num text-[11px] text-muted shrink-0">
                {lane.clues.length}
              </span>
            </button>

            {lane.clues.length === 0 ? (
              <p className="text-[11.5px] text-muted px-1 pb-1">لا تلميحات بعد</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {hidden > 0 && !expanded && (
                  <span className="chip !text-[11px] text-muted">
                    +{hidden}
                  </span>
                )}
                {shown.map((c, i) => (
                  <span key={i} className="chip !text-[12.5px]">
                    <span className="num text-[10px] text-muted">
                      {c.round}
                    </span>
                    {c.text}
                  </span>
                ))}
              </div>
            )}

            {onGuess && expanded && (
              <div className="mt-3 pt-3 border-t border-line">
                <input
                  value={mine?.words?.[String(lane.n)] ?? ""}
                  onChange={(e) => onGuess(String(lane.n), e.target.value)}
                  placeholder="تخمينك لهذه الكلمة"
                  maxLength={24}
                  className="w-full bg-[#0C1330] border border-line rounded-lg px-3 py-2.5
                             text-[14px] placeholder:text-[#4A5680] focus:border-gold
                             focus:outline-none transition"
                />
                {opinions(lane.n).filter((o) => o.uid !== myUid).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {opinions(lane.n)
                      .filter((o) => o.uid !== myUid)
                      .map((o) => (
                        <span key={o.uid} className="chip !text-[12px]">
                          <span className="text-[10px] text-muted">
                            {names?.[o.uid] ?? "زميل"}
                          </span>
                          {o.word}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The lane heading carries the most useful signal at a glance: your own
 * theory if you have one, and whether the rest of the team agrees.
 * Detail lives behind the tap.
 */
function LaneTitle({
  label, mine, opinions, color,
}: {
  label: string | null;
  mine: string;
  opinions: { uid: string; word: string }[];
  color: string;
}) {
  if (label) return <span className="text-[14px] truncate flex-1">{label}</span>;

  const distinct = new Set(opinions.map((o) => o.word.toLowerCase()));
  const agreed = opinions.length > 1 && distinct.size === 1;

  if (!mine && opinions.length === 0) {
    return <span className="text-[14px] truncate flex-1 text-muted">؟</span>;
  }

  return (
    <span className="flex-1 min-w-0 flex items-center gap-1.5">
      <span className="text-[14px] truncate" style={{ color: mine ? color : "#8794B8" }}>
        {mine || opinions[0].word}
      </span>
      {agreed ? (
        <span className="text-[10px] shrink-0" style={{ color: "#6FBF95" }}>متفقون</span>
      ) : distinct.size > 1 ? (
        <span className="num text-[10px] text-muted shrink-0">{distinct.size} آراء</span>
      ) : null}
    </span>
  );
}
