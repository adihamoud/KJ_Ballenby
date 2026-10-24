import { resolveAppOrigin } from "./app-url";

const request = { host: "localhost:3100", forwardedHost: null, forwardedProto: null };

describe("resolveAppOrigin", () => {
  it("prefers the configured public URL, reduced to its origin", () => {
    expect(resolveAppOrigin({ ...request, env: "https://kj-ballenby.vercel.app/he/" })).toBe(
      "https://kj-ballenby.vercel.app",
    );
  });

  it("ignores an unparseable or non-http configured URL", () => {
    expect(resolveAppOrigin({ ...request, env: "not a url" })).toBe("http://localhost:3100");
    expect(resolveAppOrigin({ ...request, env: "ftp://x" })).toBe("http://localhost:3100");
  });

  it("uses the request host with http for localhost and https elsewhere", () => {
    expect(resolveAppOrigin({ ...request, env: undefined })).toBe("http://localhost:3100");
    expect(resolveAppOrigin({ ...request, env: "", host: "kj.example.com" })).toBe(
      "https://kj.example.com",
    );
  });

  it("honours proxy headers", () => {
    expect(
      resolveAppOrigin({
        env: undefined,
        host: "10.0.0.5:3000",
        forwardedHost: "kj-ballenby.vercel.app",
        forwardedProto: "https",
      }),
    ).toBe("https://kj-ballenby.vercel.app");
  });
});
