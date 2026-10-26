import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

const FALLBACK = "/he/app";

describe("safeNext", () => {
  it("keeps plain same-origin paths", () => {
    expect(safeNext("/he/app", FALLBACK)).toBe("/he/app");
    expect(safeNext("/en/admin/tables", FALLBACK)).toBe("/en/admin/tables");
    expect(safeNext("/he/app?tab=queue#top", FALLBACK)).toBe("/he/app?tab=queue#top");
  });

  it("falls back for empty or missing values", () => {
    expect(safeNext(null, FALLBACK)).toBe(FALLBACK);
    expect(safeNext(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeNext("", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNext("https://evil.example.com", FALLBACK)).toBe(FALLBACK);
    expect(safeNext("http://evil.example.com/x", FALLBACK)).toBe(FALLBACK);
    expect(safeNext("//evil.example.com", FALLBACK)).toBe(FALLBACK);
    expect(safeNext("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects the L1 bypasses (backslash and control chars the URL parser normalizes)", () => {
    // `/\evil.com` -> the WHATWG parser reads `\` as `/`, so this used to become https://evil.com/.
    expect(safeNext("/\\evil.example.com", FALLBACK)).toBe(FALLBACK);
    expect(safeNext("/\\\\evil.example.com", FALLBACK)).toBe(FALLBACK);
    // Raw tab / newline between the slashes, which the parser strips.
    expect(safeNext("/\t/evil.example.com", FALLBACK)).toBe(FALLBACK);
    expect(safeNext("/\n/evil.example.com", FALLBACK)).toBe(FALLBACK);
    expect(safeNext("/path\\with\\backslash", FALLBACK)).toBe(FALLBACK);
  });

  it("none of the rejected inputs resolve off-origin when combined with an origin", () => {
    const origin = "https://app.example.com";
    for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com"]) {
      const result = safeNext(bad, FALLBACK);
      expect(new URL(result, origin).origin).toBe(origin);
    }
  });
});
