import type { TeamId } from "../lib/types";
import { TEAM_HEX } from "./ui";

const BRASS = "#D3B45F";

/** Multi-colour team shield — deep field colours stay inside the emblem only. */
export function TeamEmblem({ team, size }: { team: TeamId; size: number }) {
  const small = size < 24;
  const field = team === "gold" ? "#1E3A5F" : "#5C2E12";
  const accent = TEAM_HEX[team];
  const stroke = small ? 3.4 : 2.9;
  const pipR = small ? 2.4 : 1.7;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 62 62"
      aria-hidden
      className="block"
    >
      <path
        d="M31 3L57 12v22c0 14-10.5 23-26 27C15.5 57 5 48 5 34V12z"
        fill={field}
        stroke={BRASS}
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
      {!small && (
        <path
          d="M31 8.5L52 16v17.5c0 11.5-8.5 19-21 22.5C18.5 52.5 10 45 10 33.5V16z"
          fill="none"
          stroke={accent}
          strokeOpacity={0.85}
          strokeWidth={1.45}
          strokeLinejoin="round"
        />
      )}
      {team === "gold" ? (
        <path
          d="M31 18.5l2.9 8.4h8.8l-7.1 5.2 2.7 8.4L31 35.4l-7.3 5.1 2.7-8.4-7.1-5.2h8.8z"
          fill="#EDE4CE"
        />
      ) : (
        <path d="M31 19.5L42 38.5H20z" fill="#EDE4CE" />
      )}
      <circle cx="22" cy="46" r={pipR} fill={BRASS} />
      <circle cx="31" cy="46" r={pipR} fill={BRASS} />
      <circle cx="40" cy="46" r={pipR} fill={BRASS} />
    </svg>
  );
}
