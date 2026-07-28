import type { Room, TeamId } from "../lib/types";
import { TEAM_LABEL } from "./ui";

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

/**
 * Sticky chrome stays short: round label + timer (when counting down).
 * Scores live elsewhere (tabs, round-end).
 */
export function Header({
  room, remaining, pct,
}: {
  room: Room;
  remaining: number | null;
  pct: number;
  myTeam?: TeamId | null;
}) {
  const showTimer = phaseShowsTimer(room.phase) && (room.settings.useTimer || remaining != null);
  const crit = showTimer && remaining != null && remaining <= 10_000;
  const warn = showTimer && remaining != null && remaining <= 30_000;
  const active = room.activeTeam;
  const phaseText =
    room.phase === "guess" && room.round < 2
      ? "فكّ الشفرة"
      : room.phase === "guess" && active
      ? `شفرة ${TEAM_LABEL[active]}`
      : room.phase === "reveal" && room.round < 2
      ? "الكشف"
      : room.phase === "reveal" && active
      ? `كشف ${TEAM_LABEL[active]}`
      : (PHASE_LABEL[room.phase] ?? "");
  const roundLabel = room.suddenDeath ? "جولة حاسمة" : `الجولة ${room.round}`;

  return (
    <header
      className={`backdrop-blur-sm hairline transition-colors duration-200 ${
        crit && !room.paused ? "header-crit" : "bg-ink/95"
      }`}
      style={{ paddingTop: "var(--safe-t)" }}
    >
      <div className="relative flex items-center justify-center px-4 h-9">
        <span className="absolute inset-inline-start-4 text-[12px] text-muted truncate max-w-[40%]">
          {roundLabel}
        </span>
        {showTimer ? (
          <span
            className={`num font-display tabular-nums transition-[font-size,color] duration-200 ${
              room.paused
                ? "text-[16px] text-muted"
                : crit
                ? "text-[24px] text-parch leading-none header-crit-clock"
                : warn
                ? "text-[20px] text-[#E0913C] leading-none"
                : "text-[20px] text-parch leading-none"
            }`}
            aria-live="polite"
          >
            {room.paused ? "إيقاف" : remaining != null ? clock(remaining) : "∞"}
          </span>
        ) : (
          <span className="text-[12px] text-muted truncate ps-20">
            {phaseText}
          </span>
        )}
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
