import React from "react";
import type { TeamId } from "../lib/types";

export const TEAM_LABEL: Record<TeamId, string> = { gold: "الذهب", silver: "الفضة" };
export const TEAM_HEX: Record<TeamId, string> = { gold: "#D9A441", silver: "#AFC0DA" };

/* ------------------------------------------------------------------ */

const AVATARS = ["◈", "◉", "▲", "✦", "❖", "◐", "⬢", "✜", "◇", "⬣"];

export function Avatar({
  n, name, size = 30, team, dim,
}: {
  n: number; name?: string; size?: number; team?: TeamId | null; dim?: boolean;
}) {
  const color = team ? TEAM_HEX[team] : "#8794B8";
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span
        className="grid place-items-center rounded-full shrink-0"
        style={{
          width: size, height: size,
          border: `1px solid ${color}66`,
          background: `${color}18`,
          color, fontSize: size * 0.5,
          opacity: dim ? 0.45 : 1,
        }}
        aria-hidden
      >
        {AVATARS[n % AVATARS.length]}
      </span>
      {name && (
        <span className="truncate text-[13px]" style={{ opacity: dim ? 0.45 : 1 }}>
          {name}
        </span>
      )}
    </span>
  );
}

export function AvatarPicker({
  value, onChange,
}: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {AVATARS.map((g, i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          aria-label={`رمز ${i + 1}`}
          aria-pressed={value === i}
          className="aspect-square rounded-xl grid place-items-center text-xl transition"
          style={{
            border: `1px solid ${value === i ? "#D9A441" : "#25335F"}`,
            background: value === i ? "#D9A44118" : "#101A34",
            color: value === i ? "#D9A441" : "#8794B8",
          }}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

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
