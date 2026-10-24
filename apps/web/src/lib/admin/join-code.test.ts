import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  generateJoinCode,
  normalizeTableLabel,
} from "./join-code";

describe("generateJoinCode", () => {
  it("produces codes of the documented length from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      for (const ch of code) expect(JOIN_CODE_ALPHABET).toContain(ch);
    }
  });

  it("never emits look-alike characters", () => {
    for (const ch of "0O1IL") expect(JOIN_CODE_ALPHABET).not.toContain(ch);
  });

  it("is deterministic for a given random source and clamps at the alphabet's end", () => {
    expect(generateJoinCode(() => 0)).toBe("AAAAA");
    expect(generateJoinCode(() => 0.999999)).toBe("99999");
  });

  it("matches what the guest join form accepts (4-8 uppercase letters and digits)", () => {
    expect(generateJoinCode()).toMatch(/^[A-Z0-9]{4,8}$/);
  });
});

describe("normalizeTableLabel", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeTableLabel("  Bar   3 ")).toBe("Bar 3");
  });

  it("rejects empty and oversized labels", () => {
    expect(normalizeTableLabel("   ")).toBeNull();
    expect(normalizeTableLabel(undefined)).toBeNull();
    expect(normalizeTableLabel("x".repeat(41))).toBeNull();
    expect(normalizeTableLabel("x".repeat(40))).toHaveLength(40);
  });
});
