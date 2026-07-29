import React from "react";
import type { TeamId } from "../lib/types";

export const TEAM_LABEL: Record<TeamId, string> = { gold: "الحلفاء", silver: "المحور" };
export const TEAM_HEX: Record<TeamId, string> = { gold: "#4E86C6", silver: "#E07B35" };

/* ------------------------------------------------------------------ */

/** Two adjacent cells in one frame — filled = solid, empty = hatch. */
export function PipBoard({
  n, max = 2, color, title, size = "sm",
}: {
  n: number;
  max?: number;
  color: string;
  title?: string;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={`pip-board${size === "lg" ? " pip-board-lg" : ""}`}
      style={{ color }}
      title={title}
      aria-hidden={!title}
    >
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={`pip-cell ${i < n ? "pip-cell-on" : ""}`} />
      ))}
    </span>
  );
}

/** @deprecated Prefer PipBoard — kept for any stray imports. */
export function Pips({
  n, max = 2, color, title,
}: { n: number; max?: number; color: string; title: string }) {
  return <PipBoard n={n} max={max} color={color} title={title} />;
}

export function Stamp({
  kind, good,
}: {
  kind: "breach" | "fault";
  /** Viewer-relative: true = green (good for you), false = red (bad for you). */
  good: boolean;
}) {
  const label = kind === "breach" ? "اختراق" : "خلل";
  return (
    <span
      className={`stamp ${kind === "fault" ? "stamp-fault" : ""} ${good ? "stamp-good" : "stamp-bad"}`}
      {...(kind === "breach" ? { "data-echo": label } : {})}
    >
      {label}
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
  "w-full bg-[#1B1A14] border border-line rounded-xl px-3.5 py-3 text-[15px] " +
  "text-parch placeholder:text-[#6E6858] focus:border-gold focus:outline-none transition";

export function Banner({
  tone = "info", children,
}: { tone?: "info" | "warn" | "lock"; children: React.ReactNode }) {
  const map = {
    info: "border-line bg-[#1B1A14] text-muted",
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
