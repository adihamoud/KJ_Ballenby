import { isQrToken, isValidJoinCode, normalizeJoinCode, parseJoinCodeParam } from "./join-code";

describe("normalizeJoinCode", () => {
  it.each([
    ["demo1", "DEMO1"],
    [" ab-c d2 ", "ABCD2"],
    ["AB_C.D", "ABCD"],
    ["", ""],
    ["שלום", ""],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeJoinCode(input)).toBe(expected);
  });
});

describe("isValidJoinCode", () => {
  it.each(["DEMO1", "ABCD", "ABCDEF", "2345X"])("accepts %s", (code) => {
    expect(isValidJoinCode(code)).toBe(true);
  });

  it.each(["", "ABC", "ABCDEFG", "abcde", "AB CD"])("rejects %j", (code) => {
    expect(isValidJoinCode(code)).toBe(false);
  });
});

describe("isQrToken", () => {
  it("recognizes uuids in any case", () => {
    expect(isQrToken("8f1c5f8e-2f2d-4f0a-9a7e-2d4b3c6f1a2b")).toBe(true);
    expect(isQrToken("8F1C5F8E-2F2D-4F0A-9A7E-2D4B3C6F1A2B")).toBe(true);
  });

  it("rejects codes and junk", () => {
    expect(isQrToken("DEMO1")).toBe(false);
    expect(isQrToken("8f1c5f8e2f2d4f0a9a7e2d4b3c6f1a2b")).toBe(false);
  });
});

describe("parseJoinCodeParam", () => {
  it("lowercases uuids", () => {
    expect(parseJoinCodeParam("8F1C5F8E-2F2D-4F0A-9A7E-2D4B3C6F1A2B")).toBe(
      "8f1c5f8e-2f2d-4f0a-9a7e-2d4b3c6f1a2b",
    );
  });

  it("normalizes typed codes", () => {
    expect(parseJoinCodeParam("demo-1")).toBe("DEMO1");
  });

  it("returns null for invalid input", () => {
    expect(parseJoinCodeParam("x")).toBeNull();
    expect(parseJoinCodeParam("toolongcode")).toBeNull();
    expect(parseJoinCodeParam("")).toBeNull();
  });
});
