import { useState } from "react";
import type { TeamId } from "../lib/types";
import { TEAM_HEX } from "./ui";

/**
 * The most-referenced thing in the game. It never costs a tap to see
 * the words — only to see them larger.
 *
 * When `highlight` is set (encryptor's code digits), those keywords
 * light up larger and centered so the writer doesn't hunt the strip.
 */
export function KeysStrip({
  keys, team, highlight,
}: {
  keys: string[] | null;
  team: TeamId;
  /** Digits 1–4 that appear in the encryptor's code this round. */
  highlight?: number[] | null;
}) {
  const [open, setOpen] = useState(false);
  const color = TEAM_HEX[team];
  const lit = new Set((highlight ?? []).filter((n) => n >= 1 && n <= 4));
  const lighting = lit.size > 0;

  if (!keys) {
    return (
      <div className="px-4 py-1.5 text-[12px] text-muted hairline bg-ink/90">
        جارٍ تحميل مفاتيحكم…
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="w-full text-start bg-ink/90 backdrop-blur-sm hairline"
    >
      {open ? (
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] text-muted">مفاتيحكم السرية</span>
            <span className="text-[11px] text-muted">إخفاء</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {keys.map((k, i) => {
              const on = lit.has(i + 1);
              return (
                <div
                  key={i}
                  className="card px-3 py-2 flex items-center gap-2.5"
                  style={{
                    borderColor: on ? `${color}88` : `${color}3A`,
                    background: on ? `${color}14` : undefined,
                  }}
                >
                  <span
                    className="num text-[16px] font-semibold w-5 text-center shrink-0"
                    style={{ color }}
                  >
                    {i + 1}
                  </span>
                  <span className={`font-medium truncate ${on ? "text-[24px]" : "text-[22px]"}`}>
                    {k}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 overflow-x-auto"
        >
          {keys.map((k, i) => {
            const on = lit.has(i + 1);
            return (
              <span
                key={i}
                className={`chip shrink-0 transition ${
                  on ? "!py-1 !px-2.5 !text-[15px]" : "!py-0.5 !px-1.5 !text-[12px]"
                }`}
                style={{
                  borderColor: on ? `${color}88` : `${color}3A`,
                  background: on ? `${color}18` : undefined,
                  color: on ? "#EFE7D4" : undefined,
                  opacity: lighting && !on ? 0.45 : 1,
                }}
              >
                <span
                  className={`num font-semibold ${on ? "text-[15px]" : "text-[12px]"}`}
                  style={{ color }}
                >
                  {i + 1}
                </span>
                {k}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}
