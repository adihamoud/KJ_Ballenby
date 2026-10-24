import { qrSymbol } from "./qr";

describe("qrSymbol", () => {
  it("returns a square symbol with a quiet zone and a non-empty path", () => {
    const symbol = qrSymbol("https://example.test/he/j/00000000-0000-4000-8000-00000000d001");
    // Version 1 is 21 modules; a URL of this length needs a few versions more.
    expect(symbol.size).toBeGreaterThan(21 + 4);
    expect(symbol.path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
  });

  it("draws the finder pattern's top row offset by the quiet zone", () => {
    const symbol = qrSymbol("KJ", 2);
    // The first dark run is the 7-module finder at (0, 0), shifted by the quiet zone.
    expect(symbol.path.startsWith("M2 2h7v1h-7z")).toBe(true);
  });

  it("is deterministic", () => {
    expect(qrSymbol("DEMO1")).toEqual(qrSymbol("DEMO1"));
  });
});
