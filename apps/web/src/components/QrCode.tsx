"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

/**
 * QR code rendered as an inline SVG path (crisp at any print size, no canvas).
 * The module matrix comes from the `qrcode` package; we draw it ourselves so no
 * markup is injected as a string.
 */
export function QrCode({
  value,
  size = 160,
  label,
  className,
}: {
  value: string;
  size?: number;
  /** Accessible name; defaults to the encoded value. */
  label?: string;
  className?: string;
}) {
  const { path, modules } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const count = qr.modules.size;
    const data = qr.modules.data;
    let d = "";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (data[row * count + col]) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { path: d, modules: count };
  }, [value]);

  // Quiet zone of 2 modules around the symbol.
  const quiet = 2;
  const viewBox = `${-quiet} ${-quiet} ${modules + quiet * 2} ${modules + quiet * 2}`;

  return (
    <svg
      role="img"
      aria-label={label ?? value}
      viewBox={viewBox}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      data-qr-value={value}
    >
      <rect
        x={-quiet}
        y={-quiet}
        width={modules + quiet * 2}
        height={modules + quiet * 2}
        fill="#fff"
      />
      <path d={path} fill="#000" />
    </svg>
  );
}
