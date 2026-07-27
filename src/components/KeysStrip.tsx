import { useState } from "react";
import type { TeamId } from "../lib/types";
import { TEAM_HEX } from "./ui";

/**
 * The most-referenced thing in the game. It never costs a tap to see
 * the words — only to see them larger.
 */
export function KeysStrip({
  keys, team,
}: { keys: string[] | null; team: TeamId }) {
  const [open, setOpen] = useState(false);
  const color = TEAM_HEX[team];

  if (!keys) {
    return (
      <div className="px-4 py-2 text-[12px] text-muted hairline bg-ink/90">
        جارٍ تحميل مفاتيحكم…
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="w-full text-start bg-ink/90 backdrop-blur-sm hairline sticky z-20"
      style={{ top: "calc(var(--safe-t) + 76px)" }}
    >
      {open ? (
        <div className="px-3 py-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] text-muted">مفاتيحكم السرية</span>
            <span className="text-[11px] text-muted">إخفاء</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {keys.map((k, i) => (
              <div
                key={i}
                className="card px-3 py-2.5 flex items-center gap-2.5"
                style={{ borderColor: `${color}3A` }}
              >
                <span
                  className="num font-display text-[19px] w-6 text-center shrink-0"
                  style={{ color }}
                >
                  {i + 1}
                </span>
                <span className="text-[15px] truncate">{k}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scroll-y">
          {keys.map((k, i) => (
            <span key={i} className="chip shrink-0" style={{ borderColor: `${color}3A` }}>
              <span className="num font-display text-[13px]" style={{ color }}>
                {i + 1}
              </span>
              {k}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
