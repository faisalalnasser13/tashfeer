import type { Room, TeamId } from "../lib/types";
import { TEAMS } from "../lib/types";
import { PipBoard, TEAM_HEX } from "./ui";
import { S } from "../lib/strings";

const BREACH = "#8FAE5C";
const FAULT = "#F03B2E";

/**
 * Slim two-team score row from the Map Room mock: name + اختراق/خلل boards.
 * Your side gets a team-coloured underline; mid-game also shows أنت.
 */
export function ScoreStrip({
  room, myTeam, showMineLabel = true,
}: {
  room: Room;
  myTeam: TeamId | null;
  /** End screen keeps the underline, drops the أنت text. */
  showMineLabel?: boolean;
}) {
  const s = S(room.lang);
  return (
    <div className="flex hairline bg-ink/90">
      {TEAMS.map((t) => {
        const mine = myTeam != null && t === myTeam;
        const score = room.teams[t].score;
        const color = TEAM_HEX[t];
        return (
          <div
            key={t}
            className="flex-1 flex items-center justify-between px-3 py-1.5 min-w-0"
            style={{
              borderInlineStart: t === "silver" ? "1px solid #3A3629" : undefined,
              boxShadow: mine ? `inset 0 -2px 0 ${color}` : undefined,
            }}
          >
            <span
              className="font-display text-[12.5px] truncate"
              style={{ color, opacity: mine || myTeam == null ? 1 : 0.8 }}
            >
              {s.team[t]}
              {mine && showMineLabel && (
                <span className="text-[9.5px] text-muted ms-1.5">
                  {s.you}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 shrink-0" title={`${s.breach} · ${s.fault}`}>
              <PipBoard n={score.breach} color={BREACH} title={s.breach} />
              <span className="w-px h-[11px] bg-line" />
              <PipBoard n={score.fault} color={FAULT} title={s.fault} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
