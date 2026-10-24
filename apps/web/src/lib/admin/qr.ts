import QRCode from "qrcode";

export interface QrSymbol {
  /** Modules per side, quiet zone included. */
  size: number;
  /** SVG path data drawing every dark module as a 1x1 square, in module units. */
  path: string;
}

const QUIET_ZONE = 2;

/**
 * Encode `text` as a QR symbol and return SVG path data for the dark modules. Rendering the
 * path ourselves (instead of the library's SVG string) keeps the markup under React's control,
 * so no `dangerouslySetInnerHTML` is needed. Server only: `qrcode` is a Node dependency.
 */
export function qrSymbol(text: string, quietZone = QUIET_ZONE): QrSymbol {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const parts: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    let col = 0;
    while (col < modules.size) {
      if (!modules.get(row, col)) {
        col++;
        continue;
      }
      let run = 1;
      while (col + run < modules.size && modules.get(row, col + run)) run++;
      parts.push(`M${col + quietZone} ${row + quietZone}h${run}v1h-${run}z`);
      col += run;
    }
  }
  return { size: modules.size + quietZone * 2, path: parts.join("") };
}
