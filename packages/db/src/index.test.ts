import { normalizeSupabaseUrl, readSupabaseEnv, requireSupabaseEnv } from "./index";

describe("normalizeSupabaseUrl", () => {
  it.each([
    ["https://abc.supabase.co", "https://abc.supabase.co"],
    ["https://abc.supabase.co/", "https://abc.supabase.co"],
    ["https://abc.supabase.co/rest/v1/", "https://abc.supabase.co"],
    ["https://abc.supabase.co/auth/v1", "https://abc.supabase.co"],
    ["  https://abc.supabase.co/rest/v1/?x=1  ", "https://abc.supabase.co"],
    ["http://127.0.0.1:54321", "http://127.0.0.1:54321"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeSupabaseUrl(input)).toBe(expected);
  });

  it.each([[undefined], [""], ["   "], ["not a url"], ["ftp://abc.supabase.co"]])(
    "rejects %s",
    (input) => {
      expect(normalizeSupabaseUrl(input)).toBeNull();
    },
  );
});

describe("readSupabaseEnv", () => {
  it("returns null when either value is missing", () => {
    expect(readSupabaseEnv({})).toBeNull();
    expect(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co" })).toBeNull();
    expect(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" })).toBeNull();
  });

  it("returns the normalized url and trimmed key", () => {
    expect(
      readSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co/rest/v1/",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: " sb_publishable_x ",
      }),
    ).toEqual({ url: "https://a.supabase.co", anonKey: "sb_publishable_x" });
  });
});

describe("requireSupabaseEnv", () => {
  it("throws a helpful error when unset", () => {
    expect(() => requireSupabaseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
