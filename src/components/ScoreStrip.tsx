import type { Room, TeamId } from "../lib/types";
import { TEAMS } from "../lib/types";
import { TEAM_HEX, TEAM_LABEL } from "./ui";

const BREACH = "#8FAE5C";
const FAULT = "#F03B2E";

/**
 * Slim two-team score row from the Map Room mock: name + التقاط/تشويش pips.
 * Your side gets a team-coloured underline and an أنت marker.
 */
export function ScoreStrip({
  room, myTeam,
}: {
  room: Room;
  myTeam: TeamId;
}) {
  return (
    <div className="flex hairline bg-ink/90">
      {TEAMS.map((t) => {
        const mine = t === myTeam;
        const s = room.teams[t].score;
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
              style={{ color, opacity: mine ? 1 : 0.8 }}
            >
              {TEAM_LABEL[t]}
              {mine && (
                <span className="text-[9.5px] text-muted ms-1.5">
                  أنت
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 shrink-0" title="التقاط · تشويش">
              <PipGroup n={s.breach} color={BREACH} />
              <span className="w-px h-[11px] bg-line" />
              <PipGroup n={s.fault} color={FAULT} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PipGroup({ n, color }: { n: number; color: string }) {
  return (
    <span className="inline-flex gap-1" style={{ color }} aria-hidden>
      {[0, 1].map((i) => (
        <i key={i} className={`pip ${i < n ? "pip-on" : ""}`} />
      ))}
    </span>
  );
}
