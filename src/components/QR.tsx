import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * The room's join link as a QR code, drawn as one SVG path.
 *
 * No canvas and no image: a single <path> of 1x1 squares in a viewBox
 * sized to the module count, so it scales to any width without blurring.
 * `shape-rendering: crispEdges` keeps the modules from anti-aliasing into
 * grey mush — that blur is what makes a phone camera fail to lock on.
 */
export function QR({ url, size = 216 }: { url: string; size?: number }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { count: n, path: d };
  }, [url]);

  const quiet = 2;
  const span = count + quiet * 2;

  return (
    <svg viewBox={`0 0 ${span} ${span}`} width={size} height={size}
         shapeRendering="crispEdges" role="img" aria-label={url}
         style={{ background: "#EDE4CE", borderRadius: 4, display: "block" }}>
      <g transform={`translate(${quiet} ${quiet})`}>
        <path d={path} fill="#15140F" />
      </g>
    </svg>
  );
}
