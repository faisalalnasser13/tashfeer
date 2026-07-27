import React from "react";
import type { TeamId } from "../lib/types";

export const TEAM_LABEL: Record<TeamId, string> = { gold: "الذهب", silver: "الفضة" };
export const TEAM_HEX: Record<TeamId, string> = { gold: "#D9A441", silver: "#AFC0DA" };

/* ------------------------------------------------------------------ */

/** Two slots per token type. Filling both ends the game. */
export function Pips({
  n, max = 2, color, title,
}: { n: number; max?: number; color: string; title: string }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ color }} title={title}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={`pip ${i < n ? "pip-on" : ""}`} />
      ))}
    </span>
  );
}

export function Stamp({ kind }: { kind: "breach" | "fault" }) {
  return (
    <span className={`stamp stamp-${kind}`}>
      {kind === "breach" ? "اختراق" : "خلل"}
    </span>
  );
}

export function Btn({
  variant = "primary", className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return <button className={`btn btn-${variant} ${className}`} {...rest} />;
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-muted mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full bg-[#0C1330] border border-line rounded-xl px-3.5 py-3 text-[15px] " +
  "text-parch placeholder:text-[#4A5680] focus:border-gold focus:outline-none transition";

export function Banner({
  tone = "info", children,
}: { tone?: "info" | "warn" | "lock"; children: React.ReactNode }) {
  const map = {
    info: "border-line bg-[#101A34] text-muted",
    warn: "border-[#7A4A2A] bg-[#2A1A10] text-[#E0A46C]",
    lock: "border-[#3A2A5A] bg-[#1A1230] text-[#B49CD8]",
  } as const;
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${map[tone]}`}>
      {children}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center py-10 px-6">
      <p className="font-display text-[17px] text-parch/80">{title}</p>
      {body && <p className="text-[13px] text-muted mt-2 leading-relaxed">{body}</p>}
    </div>
  );
}
