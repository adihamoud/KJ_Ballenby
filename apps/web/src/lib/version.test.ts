import { versionLabel } from "./version";

describe("versionLabel", () => {
  it("joins version, commit and channel", () => {
    expect(versionLabel({ version: "0.2.0", commit: "a1b2c3d", channel: "preview" })).toBe(
      "0.2.0 · a1b2c3d · preview",
    );
  });

  it("drops what the build does not know", () => {
    expect(versionLabel({ version: "0.2.0", commit: "", channel: "" })).toBe("0.2.0");
    expect(versionLabel({ version: "0.2.0", commit: "a1b2c3d", channel: "" })).toBe(
      "0.2.0 · a1b2c3d",
    );
  });

  it("is empty when nothing is known", () => {
    expect(versionLabel({ version: "", commit: "", channel: "" })).toBe("");
  });
});
