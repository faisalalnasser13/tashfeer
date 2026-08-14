import type { Room, TeamId } from "../lib/types";
import { S } from "../lib/strings";

/** Phases with a player-facing countdown. Transition beats hide the clock. */
export function phaseShowsTimer(phase: string): boolean {
  return phase === "encrypt" || phase === "guess" || phase === "showdown";
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
  // Thresholds use visible remaining (phaseEndsAt), not the hidden grace.
  const crit = showTimer && remaining != null && remaining <= 10_000;
  const warn = showTimer && remaining != null && remaining <= 15_000 && !crit;
  const showdown = room.phase === "showdown" || room.showdown;
  const s = S(room.lang);
  const roundLabel = showdown
    ? (room.phase === "showdown" ? s.showdown : s.tieShowdown)
    : s.roundN(room.round);

  return (
    <header
      className={`backdrop-blur-sm hairline transition-colors duration-200 ${
        room.paused
          ? "bg-ink/95"
          : room.phase === "showdown" || crit
          ? "header-crit"
          : warn
          ? "header-warn"
          : "bg-ink/95"
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
                ? "text-[22px] text-[#FFB020] leading-none header-warn-clock"
                : "text-[20px] text-parch leading-none"
            }`}
            aria-live="polite"
          >
            {room.paused ? s.pausedClock : remaining != null ? clock(remaining) : "∞"}
          </span>
        ) : (
          <span className="w-0" aria-hidden />
        )}
      </div>

      {showTimer && (
        <div className={`timer-track${room.phase === "showdown" ? " timer-track-showdown" : ""}`}>
          <div
            className={`timer-fill ${
              room.phase === "showdown" || crit ? "timer-crit" : warn ? "timer-warn" : ""
            }`}
            style={{ width: `${remaining == null ? 100 : pct * 100}%` }}
          >
            <i className="ember" aria-hidden="true" />
            <i className="ember" aria-hidden="true" />
            <i className="ember" aria-hidden="true" />
          </div>
        </div>
      )}
    </header>
  );
}
