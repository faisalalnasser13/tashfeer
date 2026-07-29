import { useEffect, useRef, useState } from "react";
import type { TeamId } from "../lib/types";
import { OTHER } from "../lib/types";
import { TEAM_HEX } from "./ui";

/**
 * Own keys on top; under them, shared guesses for the opponent's four
 * words (other-team colour + ؟). Both rows span the full width equally.
 *
 * When `highlight` is set (encryptor's code digits), those keywords
 * light up so the writer doesn't hunt the strip.
 */
export function KeysStrip({
  keys, team, theories, setTheory, highlight,
}: {
  keys: string[] | null;
  team: TeamId;
  theories?: Record<string, string>;
  setTheory?: ((n: string, text: string) => void) | null;
  /** Digits 1–4 that appear in the encryptor's code this round. */
  highlight?: number[] | null;
}) {
  const [open, setOpen] = useState(false);
  const color = TEAM_HEX[team];
  const guessColor = TEAM_HEX[OTHER[team]];
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
          <div className="px-3 pt-2.5 pb-1">
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
            <p className="text-[11px] text-muted px-1 pt-3 pb-1.5">تخمينات الخصم</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1 px-2 pt-1.5 pb-1">
            {keys.map((k, i) => {
              const on = lit.has(i + 1);
              return (
                <span
                  key={i}
                  className={`chip min-w-0 w-full justify-center !px-1 transition ${
                    on ? "!py-1 !text-[13px]" : "!py-0.5 !text-[11px]"
                  }`}
                  style={{
                    borderColor: on ? `${color}88` : `${color}3A`,
                    background: on ? `${color}18` : undefined,
                    color: on ? "#EFE7D4" : undefined,
                    opacity: lighting && !on ? 0.45 : 1,
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

      <div
        className="grid grid-cols-4 gap-1 px-2 pb-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {[1, 2, 3, 4].map((n) => (
          <TheoryChip
            key={n}
            n={n}
            remote={theories?.[String(n)] ?? ""}
            color={guessColor}
            onChange={setTheory ? (t) => setTheory(String(n), t) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function TheoryChip({
  n, remote, color, onChange,
}: {
  n: number;
  remote: string;
  color: string;
  onChange?: (text: string) => void;
}) {
  const [value, setValue] = useState(remote);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setValue(remote);
  }, [remote]);

  const show = value.trim();

  if (!onChange) {
    return (
      <span
        className="chip min-w-0 w-full justify-center !py-0.5 !px-1 !text-[11px]"
        style={{ borderColor: `${color}55`, color }}
        title={show ? `${show}؟` : "؟"}
      >
        <span className="num font-semibold text-[11px] shrink-0">{n}</span>
        <span className="truncate">{show ? `${show}؟` : "؟"}</span>
      </span>
    );
  }

  return (
    <label
      className="chip min-w-0 w-full justify-center !py-0.5 !px-1 !text-[11px]
                 flex items-center gap-0.5 cursor-text"
      style={{ borderColor: `${color}66`, color }}
    >
      <span className="num font-semibold text-[11px] shrink-0">{n}</span>
      <input
        value={value}
        maxLength={24}
        placeholder=""
        aria-label={`تخمين كلمة الخصم ${n}`}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; }}
        onChange={(e) => {
          const t = e.target.value.slice(0, 24);
          setValue(t);
          onChange(t);
        }}
        className="bg-transparent border-0 outline-none text-center font-medium
                   text-[11px] min-w-0 flex-1 w-0 placeholder:opacity-50"
        style={{ color }}
      />
      <span className="shrink-0 opacity-90" aria-hidden>؟</span>
    </label>
  );
}
