import { normalizeGuestName, normalizeJoinCode } from "./join-code";

describe("normalizeJoinCode", () => {
  it("uppercases short codes and strips spaces and dashes", () => {
    expect(normalizeJoinCode("demo1")).toBe("DEMO1");
    expect(normalizeJoinCode(" de mo-1 ")).toBe("DEMO1");
  });

  it("keeps QR tokens as lowercase uuids", () => {
    const token = "9B2F4C1E-6A7D-4E3B-9C2A-1F0E8D7C6B5A";
    expect(normalizeJoinCode(token)).toBe(token.toLowerCase());
  });

  it("rejects empty, too short, too long or non-alphanumeric input", () => {
    expect(normalizeJoinCode("")).toBeNull();
    expect(normalizeJoinCode(null)).toBeNull();
    expect(normalizeJoinCode("ab")).toBeNull();
    expect(normalizeJoinCode("ABCDEFGHI")).toBeNull();
    expect(normalizeJoinCode("DEM*1")).toBeNull();
    expect(normalizeJoinCode("שולחן")).toBeNull();
  });
});

describe("normalizeGuestName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeGuestName("  דנה   כהן ")).toBe("דנה כהן");
  });

  it("rejects empty or over-long names", () => {
    expect(normalizeGuestName("   ")).toBeNull();
    expect(normalizeGuestName(undefined)).toBeNull();
    expect(normalizeGuestName("x".repeat(41))).toBeNull();
    expect(normalizeGuestName("x".repeat(40))).toHaveLength(40);
  });
});
