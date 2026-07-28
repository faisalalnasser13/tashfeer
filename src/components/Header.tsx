import type { Room, TeamId } from "../lib/types";

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
 * Sticky chrome: timer (screen-left) + round (screen-right). Nothing else.
 * In RTL, DOM order [round, timer] + justify-between puts them there.
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
  const roundLabel = room.suddenDeath ? "جولة حاسمة" : `الجولة ${room.round}`;

  return (
    <header
      className={`backdrop-blur-sm hairline transition-colors duration-200 ${
        crit && !room.paused ? "header-crit" : "bg-ink/95"
      }`}
      style={{ paddingTop: "var(--safe-t)" }}
    >
      <div className="flex items-center justify-between px-4 h-9">
        <span className="text-[12px] text-muted truncate">
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
                ? "text-[20px] text-[#E09A2E] leading-none"
                : "text-[20px] text-parch leading-none"
            }`}
            aria-live="polite"
          >
            {room.paused ? "إيقاف" : remaining != null ? clock(remaining) : "∞"}
          </span>
        ) : (
          <span className="w-0" aria-hidden />
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
