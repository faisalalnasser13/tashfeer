import { useState } from "react";
import type { TeamId } from "../lib/types";
import { TEAM_HEX } from "./ui";

/**
 * Own team's four keywords. When `highlight` is set (encryptor's code
 * digits), those keywords light up so the writer doesn't hunt the strip.
 * Opponent theories live on ClueGrid / records — not in this header.
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
    <div className="w-full bg-ink/90 backdrop-blur-sm hairline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-start"
      >
        {open ? (
          <div className="px-3 pt-2.5 pb-2.5">
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
                    className="card !rounded-none px-3 py-2 flex items-center gap-2.5"
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
          <div className="grid grid-cols-4 gap-1 px-2 pt-1.5 pb-1.5">
            {keys.map((k, i) => {
              const on = lit.has(i + 1);
              return (
                <span
                  key={i}
                  className={`chip !rounded-none min-w-0 w-full justify-center !px-1 transition ${
                    on ? "!py-1 !text-[13px]" : "!py-0.5 !text-[11px]"
                  }`}
                  style={{
                    borderColor: on ? `${color}88` : `${color}3A`,
                    background: on ? `${color}18` : undefined,
                    color: on ? "#EFE7D4" : undefined,
                    opacity: lighting && !on ? 0.7 : 1,
                  }}
                  title={k}
                >
                  <span
                    className={`num font-semibold shrink-0 ${on ? "text-[13px]" : "text-[11px]"}`}
                    style={{ color }}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate">{k}</span>
                </span>
              );
            })}
          </div>
        )}
      </button>
    </div>
  );
}
