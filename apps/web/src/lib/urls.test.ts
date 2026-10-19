import { buildGroupInviteUrl, buildJoinUrl, joinPath, loginPath, safeNext } from "./urls";

describe("buildJoinUrl", () => {
  it("encodes the locale and token", () => {
    expect(buildJoinUrl("https://kj.example", "he", "8f1c5f8e-2f2d-4f0a-9a7e-2d4b3c6f1a2b")).toBe(
      "https://kj.example/he/join/8f1c5f8e-2f2d-4f0a-9a7e-2d4b3c6f1a2b",
    );
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(buildJoinUrl("http://localhost:3000/", "en", "abc")).toBe(
      "http://localhost:3000/en/join/abc",
    );
  });
});

describe("joinPath", () => {
  it("builds the manual page and the prefilled page", () => {
    expect(joinPath("he")).toBe("/he/join");
    expect(joinPath("en", "DEMO1")).toBe("/en/join/DEMO1");
  });
});

describe("buildGroupInviteUrl", () => {
  it("points at the group join route", () => {
    expect(buildGroupInviteUrl("https://kj.example", "en", "g1")).toBe(
      "https://kj.example/en/join/group/g1",
    );
  });
});

describe("safeNext", () => {
  it("keeps relative same-origin paths", () => {
    expect(safeNext("/he/join/DEMO1", "/x")).toBe("/he/join/DEMO1");
  });

  it.each([null, undefined, "", "https://evil.example", "//evil.example", "/\\evil", "/a\nb"])(
    "falls back for %j",
    (value) => {
      expect(safeNext(value, "/fallback")).toBe("/fallback");
    },
  );
});

describe("loginPath", () => {
  it("adds an encoded next param only when safe", () => {
    expect(loginPath("he")).toBe("/he/login");
    expect(loginPath("he", "/he/join/DEMO1")).toBe("/he/login?next=%2Fhe%2Fjoin%2FDEMO1");
    expect(loginPath("he", "https://evil.example")).toBe("/he/login");
  });
});
