import { POSITION_STEP, positionBetween, tailPosition } from "./position";

describe("positionBetween", () => {
  it("returns the step for an empty queue", () => {
    expect(positionBetween(undefined, undefined)).toBe(POSITION_STEP);
  });

  it("inserts before the head", () => {
    expect(positionBetween(undefined, 1000)).toBe(0);
  });

  it("appends after the tail", () => {
    expect(positionBetween(3000, undefined)).toBe(4000);
  });

  it("returns the midpoint between two neighbours", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionBetween(1000, 1500)).toBe(1250);
  });

  it("rejects an inverted range", () => {
    expect(() => positionBetween(2000, 1000)).toThrow();
    expect(() => positionBetween(1000, 1000)).toThrow();
  });
});

describe("tailPosition", () => {
  it("handles an empty list", () => {
    expect(tailPosition([])).toBe(POSITION_STEP);
  });

  it("goes one step past the max", () => {
    expect(tailPosition([1000, 2500, 2000])).toBe(3500);
  });
});
