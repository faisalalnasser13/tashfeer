import { APP_VERSION } from "../lib/version";

/** Quiet build stamp — always on screen so support can ask "what version?". */
export function VersionBadge() {
  return (
    <p
      className="text-center text-[10px] text-muted/50 select-none tracking-wide"
      dir="ltr"
      title={`v${APP_VERSION}`}
    >
      AboMona Studios™
    </p>
  );
}
