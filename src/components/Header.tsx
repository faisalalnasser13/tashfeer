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

/** Phases with a player-facing countdown. Transition beats hide the clock. */
export function phaseShowsTimer(phase: string): boolean {
  return phase === "encrypt" || phase === "guess";
}

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
  const showTimer = phaseShowsTimer(room.phase) && (room.settings.useTimer || remaining != null);
  const crit = showTimer && remaining != null && remaining <= 10_000;
  const warn = showTimer && remaining != null && remaining <= 30_000;
  const active = room.activeTeam;
  const phaseText =
    room.phase === "guess" && active
      ? `شفرة ${TEAM_LABEL[active]}`
      : room.phase === "reveal" && active
      ? `كشف ${TEAM_LABEL[active]}`
      : (PHASE_LABEL[room.phase] ?? "");

  return (
    <header
      className={`backdrop-blur-sm hairline transition-colors duration-200 ${
        crit && !room.paused ? "header-crit" : "bg-ink/95"
      }`}
      style={{ paddingTop: "var(--safe-t)" }}
    >
      <div className="flex items-center justify-between px-4 h-12">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={`font-display text-[15px] whitespace-nowrap ${
              crit && !room.paused ? "text-parch" : "text-gold"
            }`}
          >
            {room.suddenDeath ? "جولة حاسمة" : `الجولة ${room.round}`}
          </span>
          <span
            className={`text-[12px] truncate ${
              crit && !room.paused ? "text-parch/70" : "text-muted"
            }`}
          >
            {phaseText}
          </span>
        </div>
        {showTimer ? (
          <span
            className={`num font-display tabular-nums transition-[font-size,color] duration-200 ${
              room.paused
                ? "text-[18px] text-muted"
                : crit
                ? "text-[26px] text-parch leading-none header-crit-clock"
                : warn
                ? "text-[22px] text-[#E0913C] leading-none"
                : "text-[22px] text-parch leading-none"
            }`}
            aria-live="polite"
          >
            {room.paused ? "إيقاف" : remaining != null ? clock(remaining) : "∞"}
          </span>
        ) : (
          <span className="text-[12px] text-muted"> </span>
        )}
      </div>

      <div className="flex items-stretch gap-px bg-line">
        {TEAMS.map((t) => (
          <TeamScore key={t} room={room} team={t} mine={myTeam === t} crit={crit && !room.paused} />
        ))}
      </div>

      {showTimer && (
        <div className="timer-track">
          <div
            className={`timer-fill ${crit ? "timer-crit" : warn ? "timer-warn" : ""}`}
            style={{ width: `${remaining == null ? 100 : pct * 100}%` }}
          />
        </div>
      )}
    </header>
  );
}

function TeamScore({
  room, team, mine, crit,
}: {
  room: Room; team: TeamId; mine: boolean; crit?: boolean;
}) {
  const s = room.teams[team].score;
  return (
    <div
      className={`flex-1 flex items-center justify-between gap-2 px-3 py-1.5 ${
        crit ? "bg-transparent" : "bg-ink"
      }`}
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
