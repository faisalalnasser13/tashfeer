import type { Room, TeamId } from "../lib/types";
import { TEAMS } from "../lib/types";
import { Pips, TEAM_HEX, TEAM_LABEL } from "./ui";

const PHASE_LABEL: Record<string, string> = {
  keys: "احفظوا مفاتيحكم",
  encrypt: "كتابة التلميحات",
  guess: "فكّ واعتراض",
  reveal: "الكشف",
  roundEnd: "نهاية الجولة",
  over: "انتهت",
};

function clock(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Header({
  room, remaining, pct, myTeam,
}: {
  room: Room;
  remaining: number | null;
  pct: number;
  myTeam: TeamId | null;
}) {
  const crit = remaining != null && remaining <= 10_000;
  const warn = remaining != null && remaining <= 30_000;

  return (
    <header
      className="sticky top-0 z-30 bg-ink/95 backdrop-blur-sm hairline"
      style={{ paddingTop: "var(--safe-t)" }}
    >
      <div className="flex items-center justify-between px-4 h-11">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-display text-[15px] text-gold whitespace-nowrap">
            {room.suddenDeath ? "جولة حاسمة" : `الجولة ${room.round}`}
          </span>
          <span className="text-[12px] text-muted truncate">
            {PHASE_LABEL[room.phase] ?? ""}
          </span>
        </div>
        <span
          className={`num font-display text-[16px] tabular-nums ${
            room.paused ? "text-muted" : crit ? "text-alarm" : warn ? "text-[#E0913C]" : "text-parch/80"
          }`}
        >
          {room.paused ? "إيقاف" : room.settings.useTimer || remaining != null
            ? clock(remaining)
            : "∞"}
        </span>
      </div>

      <div className="flex items-stretch gap-px bg-line">
        {TEAMS.map((t) => (
          <TeamScore key={t} room={room} team={t} mine={myTeam === t} />
        ))}
      </div>

      <div className="timer-track">
        <div
          className={`timer-fill ${crit ? "timer-crit" : warn ? "timer-warn" : ""}`}
          style={{ width: `${remaining == null ? 100 : pct * 100}%` }}
        />
      </div>
    </header>
  );
}

function TeamScore({ room, team, mine }: { room: Room; team: TeamId; mine: boolean }) {
  const s = room.teams[team].score;
  return (
    <div
      className="flex-1 flex items-center justify-between gap-2 px-3 py-1.5 bg-ink"
      style={{ boxShadow: mine ? `inset 0 -2px 0 ${TEAM_HEX[team]}` : undefined }}
    >
      <span
        className="font-display text-[13px] truncate"
        style={{ color: TEAM_HEX[team], opacity: mine ? 1 : 0.62 }}
      >
        {TEAM_LABEL[team]}
        {mine && <span className="text-[10px] text-muted ms-1.5">أنت</span>}
      </span>
      <span
        className="flex items-center gap-2.5 shrink-0"
        aria-label={`اختراق ${s.breach} من ٢، خلل ${s.fault} من ٢`}
      >
        <Pips n={s.breach} color="#6FBF95" title="اختراق" />
        <span className="w-px h-3 bg-line" />
        <Pips n={s.fault} color="#E57A6F" title="خلل" />
      </span>
    </div>
  );
}
