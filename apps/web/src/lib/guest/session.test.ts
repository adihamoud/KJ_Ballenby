import { cookieNeedsSecure, parseGuestSession, type GuestSession } from "./session";

const valid: GuestSession = {
  v: 2,
  guestId: "22222222-2222-4222-8222-222222222222",
  tableId: "11111111-1111-4111-8111-111111111111",
  tableLabel: "T1",
  joinCode: "DEMO1",
  venueId: "00000000-0000-0000-0000-000000000001",
  venueName: "Demo Karaoke Bar",
  venueSlug: "demo-bar",
  name: "דנה",
  joinedAt: "2026-10-23T18:00:00.000Z",
};

describe("parseGuestSession", () => {
  it("round-trips a valid session", () => {
    expect(parseGuestSession(JSON.stringify(valid))).toEqual(valid);
  });

  it("returns null for missing, malformed or incomplete cookies", () => {
    expect(parseGuestSession(undefined)).toBeNull();
    expect(parseGuestSession("")).toBeNull();
    expect(parseGuestSession("not json")).toBeNull();
    expect(parseGuestSession("42")).toBeNull();
    expect(parseGuestSession(JSON.stringify({ ...valid, v: 1 }))).toBeNull();
    expect(parseGuestSession(JSON.stringify({ ...valid, name: "" }))).toBeNull();
    const { tableId: _dropped, ...withoutTable } = valid;
    void _dropped;
    expect(parseGuestSession(JSON.stringify(withoutTable))).toBeNull();
  });

  it("drops unknown extra fields", () => {
    const parsed = parseGuestSession(JSON.stringify({ ...valid, extra: "x" }));
    expect(parsed).toEqual(valid);
  });
});

describe("cookieNeedsSecure", () => {
  it("is on behind an https proxy (Vercel) whatever the environment", () => {
    expect(
      cookieNeedsSecure({ forwardedProto: "https", host: "kj.example", nodeEnv: "production" }),
    ).toBe(true);
    expect(
      cookieNeedsSecure({
        forwardedProto: "https",
        host: "localhost:3000",
        nodeEnv: "development",
      }),
    ).toBe(true);
    expect(
      cookieNeedsSecure({
        forwardedProto: "https, http",
        host: "kj.example",
        nodeEnv: "production",
      }),
    ).toBe(true);
  });

  it("is off for a production build served over plain http on localhost (CI, WebKit)", () => {
    expect(
      cookieNeedsSecure({ forwardedProto: null, host: "localhost:3000", nodeEnv: "production" }),
    ).toBe(false);
    expect(
      cookieNeedsSecure({ forwardedProto: null, host: "127.0.0.1:3100", nodeEnv: "production" }),
    ).toBe(false);
    expect(
      cookieNeedsSecure({ forwardedProto: "http", host: "kj.example", nodeEnv: "production" }),
    ).toBe(false);
  });

  it("stays on for a production build on a real host without the proxy header", () => {
    expect(
      cookieNeedsSecure({ forwardedProto: null, host: "kj.example", nodeEnv: "production" }),
    ).toBe(true);
  });

  it("is off in development without https", () => {
    expect(
      cookieNeedsSecure({ forwardedProto: null, host: "localhost:3000", nodeEnv: "development" }),
    ).toBe(false);
    expect(
      cookieNeedsSecure({ forwardedProto: null, host: "kj.example", nodeEnv: "development" }),
    ).toBe(false);
  });
});
