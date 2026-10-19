import { formatIsraeliMobile, normalizeIsraeliMobile } from "./phone";

describe("normalizeIsraeliMobile", () => {
  it.each([
    ["050-123-4567", "+972501234567"],
    ["0501234567", "+972501234567"],
    ["050 123 4567", "+972501234567"],
    ["+972501234567", "+972501234567"],
    ["+972-50-123-4567", "+972501234567"],
    ["972501234567", "+972501234567"],
    ["501234567", "+972501234567"],
    ["054-999-8888", "+972549998888"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeIsraeliMobile(input)).toBe(expected);
  });

  it.each([
    [""],
    ["abc"],
    ["03-123-4567"], // landline
    ["050-123-456"], // too short
    ["050-123-45678"], // too long
    ["+1 555 123 4567"], // not Israeli
    ["+97250123456"], // 8 national digits
  ])("rejects %s", (input) => {
    expect(normalizeIsraeliMobile(input)).toBeNull();
  });
});

describe("formatIsraeliMobile", () => {
  it("formats E.164 as local", () => {
    expect(formatIsraeliMobile("+972501234567")).toBe("050-123-4567");
  });

  it("returns unknown formats unchanged", () => {
    expect(formatIsraeliMobile("+15551234567")).toBe("+15551234567");
  });
});
