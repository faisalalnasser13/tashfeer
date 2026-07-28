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
  /** Own team's four keywords — under pad buttons + placed slots (decrypt). */
  keyWords,
  /** Shared guesses for opponent digits — shown with trailing ؟ (intercept). */
  guessWords,
  /** Past clue texts indexed by digit 1–4 — under pad buttons + placed slots (intercept). */
  historyByDigit,
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
  keyWords?: string[] | null;
  guessWords?: (string | null | undefined)[] | null;
  historyByDigit?: string[][] | null;
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

  function labelFor(digit: number): {
    word?: string;
    guess?: string;
    hints: string[];
  } {
    const word = keyWords?.[digit - 1] || undefined;
    const rawGuess = guessWords?.[digit - 1];
    const guess =
      typeof rawGuess === "string" && rawGuess.trim()
        ? rawGuess.trim()
        : guessWords
          ? ""
          : undefined;
    const hints = historyByDigit?.[digit - 1] ?? [];
    return { word, guess, hints };
  }

  function GuessLabel({ text }: { text: string }) {
    return (
      <span className="pad-word" style={{ color: tone === "silver" ? "#E07B35" : "#4E86C6" }}>
        {text || "—"}
        <span aria-hidden>؟</span>
      </span>
    );
  }

  return (
    <div>
      <div className="cartouche">
        {[0, 1, 2].map((i) => {
          const v = values[i];
          const clue = clues?.[i];
          const verdict =
            truth && truth.length === 3 ? (v === truth[i] ? "right" : "wrong") : null;
          const { word, guess, hints } =
            v != null ? labelFor(v) : { word: undefined, guess: undefined, hints: [] as string[] };
          const hasExtra = Boolean(word) || guess !== undefined || hints.length > 0;
          const cls = [
            "slot",
            tone === "silver" ? "slot-silver" : "",
            v == null ? "slot-empty" : "",
            editable && focus === i ? "slot-active" : "",
            verdict === "right" ? "slot-right" : "",
            verdict === "wrong" ? "slot-wrong" : "",
            hasExtra ? "slot-has-extra" : "",
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
              <span className="num slot-digit">{v == null ? "—" : v}</span>
              {word ? <span className="slot-word">{word}</span> : null}
              {guess !== undefined ? (
                <span
                  className="slot-word"
                  style={{ color: tone === "silver" ? "#E07B35" : "#4E86C6" }}
                >
                  {guess || "—"}
                  <span aria-hidden>؟</span>
                </span>
              ) : null}
              {hints.length > 0 ? (
                <span className="slot-hints">
                  {hints.map((h, hi) => (
                    <span key={hi} className="slot-hint">{h}</span>
                  ))}
                </span>
              ) : null}
            </button>
          );
          if (!clues) return slot;
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="text-center px-0.5">
                <p className="text-[10px] text-muted leading-none mb-0.5">{ORDINALS[i]}</p>
                <p
                  className="text-[18px] font-medium leading-snug"
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
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map((n) => {
            const used = values.includes(n);
            const { word, guess, hints } = labelFor(n);
            const hasExtra = Boolean(word) || guess !== undefined || hints.length > 0;
            return (
              <button
                key={n}
                onClick={() => assign(n)}
                className={`pad-btn ${hasExtra ? "pad-has-extra" : ""}`}
                style={{
                  borderColor: used ? "#2B3A68" : "#3A4C86",
                  background: used ? "#0C1330" : "transparent",
                  opacity: used ? 0.55 : 1,
                }}
              >
                <span className="num pad-digit">{n}</span>
                {word ? <span className="pad-word">{word}</span> : null}
                {guess !== undefined ? <GuessLabel text={guess} /> : null}
                {hints.length > 0 ? (
                  <span className="pad-hints">
                    {hints.map((h, hi) => (
                      <span key={hi} className="pad-hint">{h}</span>
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
          <button
            onClick={clear}
            aria-label="مسح"
            className="pad-btn pad-clear col-span-2"
          >
            مسح
          </button>
        </div>
      )}
    </div>
  );
}
