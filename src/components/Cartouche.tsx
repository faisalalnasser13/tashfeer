import { useEffect, useState, Fragment } from "react";
import { ORDINALS } from "../lib/arabic";
import type { TeamId } from "../lib/types";
import { TEAM_HEX } from "./ui";

/** Pad / input chrome keyed to team id (gold=allies blue, silver=axis orange). */
function padChrome(tone: TeamId) {
  const accent = TEAM_HEX[tone];
  if (tone === "silver") {
    return {
      accent,
      idleBorder: "#8A5230",
      usedBorder: "#4A3018",
      usedBg: "#1A1008",
    };
  }
  return {
    accent,
    idleBorder: "#3A4C86",
    usedBorder: "#2B3A68",
    usedBg: "#0C1330",
  };
}

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
  /** Hide the 1–4 pad grid (reveal screen — digits only). Default true. */
  showPads = true,
  size = "md",
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
  showPads?: boolean;
  /** `dense` = encryptor guess spectate only (compact, aligned columns). */
  size?: "md" | "sm" | "xs" | "dense";
}) {
  const editable = Boolean(onChange);
  const [focus, setFocus] = useState<number>(0);
  const chrome = padChrome(tone);

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
    // Compact sizes: keep only recent prior clues so stacks stay short.
    const clipped =
      size === "dense" && hints.length > 2
        ? hints.slice(-2)
        : size === "xs" && hints.length > 3
          ? hints.slice(-3)
          : size === "sm" && hints.length > 2
            ? hints.slice(-2)
            : hints;
    return { word, guess, hints: clipped };
  }

  function GuessLabel({ text }: { text: string }) {
    return (
      <span className="pad-word" style={{ color: chrome.accent }}>
        {text || "—"}
        <span aria-hidden>؟</span>
      </span>
    );
  }

  const padsVisible =
    showPads && (editable || keyWords || guessWords || historyByDigit);
  const sizeClass =
    size === "dense"
      ? " cartouche-dense"
      : size === "xs"
        ? " cartouche-xs"
        : size === "sm"
          ? " cartouche-sm"
          : "";
  const clueText =
    size === "dense"
      ? "text-[11px] leading-snug dense-clue-text"
      : size === "xs"
        ? "text-[11px] leading-tight"
        : size === "sm"
          ? "text-[12px] leading-snug"
          : "text-[18px] leading-snug";
  const ordText =
    size === "dense" ? "text-[9px]" : "text-[10px]";

  return (
    <div>
      <div className={`cartouche${sizeClass}`}>
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
              data-ord={clue ? undefined : ORDINALS[i]}
              className={cls}
              disabled={!editable}
              onClick={() => setFocus(i)}
              aria-label={`${ORDINALS[i]}: ${v == null ? "فارغ" : v}`}
            >
              <span className="num slot-digit">{v == null ? "—" : v}</span>
              {word ? <span className="slot-word">{word}</span> : null}
              {guess !== undefined ? (
                <span className="slot-word" style={{ color: chrome.accent }}>
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
          if (!clues) return <Fragment key={i}>{slot}</Fragment>;
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className={`text-center px-0.5${size === "dense" ? " dense-clue" : ""}`}>
                <p className={`${ordText} text-muted leading-none mb-0.5`}>{ORDINALS[i]}</p>
                <p
                  className={`${clueText} font-medium`}
                  style={{ color: chrome.accent }}
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

      {padsVisible && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map((n) => {
            const used = values.includes(n);
            const { word, guess, hints } = labelFor(n);
            const hasExtra = Boolean(word) || guess !== undefined || hints.length > 0;
            return (
              <button
                key={n}
                type="button"
                onClick={() => assign(n)}
                disabled={!editable}
                className={`pad-btn ${hasExtra ? "pad-has-extra" : ""}`}
                style={{
                  borderColor: used ? chrome.usedBorder : chrome.idleBorder,
                  background: used ? chrome.usedBg : "transparent",
                  opacity: used ? 0.55 : 1,
                  cursor: editable ? undefined : "default",
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
          {editable && (
            <button
              type="button"
              onClick={clear}
              aria-label="مسح"
              className="pad-btn pad-clear col-span-2"
            >
              مسح
            </button>
          )}
        </div>
      )}
    </div>
  );
}
