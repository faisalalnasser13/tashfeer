import type { Lang } from "./types";

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

export function normalizeAr(input: string): string {
  return (input || "")
    .trim()
    .replace(TASHKEEL, "")
    .replace(/\u0640/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeEn(input: string): string {
  return (input || "")
    .trim()
    .replace(/[\u200B-\u200F\u202A-\u202E]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Clue / guess comparison. Arabic folds hamza and tashkeel; English is case-fold. */
export function normalizeText(input: string, lang: Lang = "ar"): string {
  return lang === "en" ? normalizeEn(input) : normalizeAr(input);
}

export function normalizeKey(input: string): string {
  return normalizeAr(input).replace(/^ال/, "");
}

/** Keyword identity at deal time. English also drops a leading article. */
export function normalizeKeyword(input: string, lang: Lang = "ar"): string {
  if (lang === "en") return normalizeEn(input).replace(/^(the|a|an)\s+/, "");
  return normalizeKey(input);
}

/** Ordinal labels. Position is meaning here, so it is always spelled out. */
export const ORDINALS_AR = ["\u0627\u0644\u0623\u0648\u0644", "\u0627\u0644\u062B\u0627\u0646\u064A", "\u0627\u0644\u062B\u0627\u0644\u062B"] as const;
export const ORDINALS_EN = ["first", "second", "third"] as const;
/** @deprecated use ordinalsFor(lang) — kept so older imports still compile. */
export const ORDINALS = ORDINALS_AR;

export function ordinalsFor(lang: Lang = "ar"): readonly [string, string, string] {
  return lang === "en" ? ORDINALS_EN : ORDINALS_AR;
}

export function plural(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n % 100 >= 3 && n % 100 <= 10) return few;
  return many;
}
