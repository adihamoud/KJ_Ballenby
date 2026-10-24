import { headers } from "next/headers";

export interface OriginInput {
  /** `NEXT_PUBLIC_APP_URL`, the canonical public address when the deployment sets one. */
  env: string | undefined;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
}

/**
 * The origin printed into QR codes. The configured app URL wins so a sheet printed from a
 * preview deployment still points guests at the real site; otherwise the request's own host
 * is used (local preview, CI), with https assumed for anything that is not localhost.
 */
export function resolveAppOrigin(input: OriginInput): string {
  const configured = input.env?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return `${url.protocol}//${url.host}`;
      }
    } catch {
      // Fall through to the request host.
    }
  }
  const host = (input.forwardedHost ?? input.host ?? "localhost:3000").split(",")[0]!.trim();
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const local =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
  const proto =
    input.forwardedProto?.split(",")[0]?.trim().toLowerCase() ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

export async function getAppOrigin(): Promise<string> {
  const h = await headers();
  return resolveAppOrigin({
    env: process.env.NEXT_PUBLIC_APP_URL,
    host: h.get("host"),
    forwardedHost: h.get("x-forwarded-host"),
    forwardedProto: h.get("x-forwarded-proto"),
  });
}
