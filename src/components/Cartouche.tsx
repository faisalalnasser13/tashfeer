import { useEffect, useState } from "react";
import { ORDINALS } from "../lib/arabic";
import type { TeamId } from "../lib/types";

/**
 * Three ordered slots.
 *
 * The document order is the source of truth: slot 0 is الأول. Under
 * `dir="rtl"` that puts it on the right, which is correct — but nothing
 * in this component flips anything, and the ordinal is printed on every
 * slot so the reading order is never ambiguous.
 */
export function Cartouche({
  values,
  onChange,
  tone = "gold",
  truth,
  clues,
}: {
  values: (number | null)[];
  onChange?: (next: (number | null)[]) => void;
  tone?: TeamId;
  /** When present the slots colour themselves against the real code. */
  truth?: number[] | null;
  /**
   * The three clues, printed above the slot each one belongs to.
   * Clue and slot share an ordinal, so pairing them costs no extra
   * height and removes the mental hop between two separate lists.
   */
  clues?: string[];
}) {
  const editable = Boolean(onChange);
  const [focus, setFocus] = useState<number>(0);

  useEffect(() => {
    if (!editable) return;
    const firstEmpty = values.findIndex((v) => v == null);
    if (firstEmpty >= 0) setFocus(firstEmpty);
    // deliberately mount-only: re-focusing on every teammate's edit
    // would yank the cursor around mid-discussion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  function assign(n: number) {
    if (!onChange) return;
    // A code never repeats a digit, so taking one frees it elsewhere.
    const next = values.map((v, i) => (i === focus ? n : v === n ? null : v));
    onChange(next);
    const nextEmpty = next.findIndex((v, i) => i !== focus && v == null);
    setFocus(nextEmpty >= 0 ? nextEmpty : focus);
    navigator.vibrate?.(8);
  }

  function clear() {
    if (!onChange) return;
    onChange(values.map((v, i) => (i === focus ? null : v)));
    navigator.vibrate?.(8);
  }

  return (
    <div>
      <div className="cartouche">
        {[0, 1, 2].map((i) => {
          const v = values[i];
          const clue = clues?.[i];
          const verdict =
            truth && truth.length === 3 ? (v === truth[i] ? "right" : "wrong") : null;
          const cls = [
            "slot",
            tone === "silver" ? "slot-silver" : "",
            v == null ? "slot-empty" : "",
            editable && focus === i ? "slot-active" : "",
            verdict === "right" ? "slot-right" : "",
            verdict === "wrong" ? "slot-wrong" : "",
          ].join(" ");
          const slot = (
            <button
              key={i}
              data-ord={clue ? undefined : ORDINALS[i]}
              className={cls}
              disabled={!editable}
              onClick={() => setFocus(i)}
              aria-label={`${ORDINALS[i]}: ${v == null ? "فارغ" : v}`}
            >
              <span className="num">{v == null ? "—" : v}</span>
            </button>
          );
          if (!clues) return slot;
          return (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="text-center px-1">
                <p className="text-[10px] text-muted leading-none mb-1">{ORDINALS[i]}</p>
                <p
                  className="font-display text-[16px] leading-tight truncate"
                  style={{ color: tone === "silver" ? "#AFC0DA" : "#D9A441" }}
                  title={clue}
                >
                  {clue || "—"}
                </p>
              </div>
              {slot}
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4].map((n) => {
            const used = values.includes(n);
            return (
              <button
                key={n}
                onClick={() => assign(n)}
                className="num rounded-xl py-3 font-display text-[22px] transition active:scale-95"
                style={{
                  border: `1px solid ${used ? "#2B3A68" : "#3A4C86"}`,
                  background: used ? "#0C1330" : "#16204200",
                  color: used ? "#5B6789" : "#EFE7D4",
                  opacity: used ? 0.5 : 1,
                }}
              >
                {n}
              </button>
            );
          })}
          <button
            onClick={clear}
            aria-label="مسح"
            className="rounded-xl py-3 text-[13px] text-muted border border-line active:scale-95 transition"
          >
            مسح
          </button>
        </div>
      )}
    </div>
  );
}
