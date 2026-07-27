import { APP_VERSION } from "../lib/version";

/** Quiet build stamp — always on screen so support can ask "what version?". */
export function VersionBadge() {
  return (
    <p
      className="text-center text-[10px] text-muted/50 tabular-nums select-all"
      dir="ltr"
      title="إصدار التطبيق"
    >
      v{APP_VERSION}
    </p>
  );
}
