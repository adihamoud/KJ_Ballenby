import { headers } from "next/headers";

/**
 * Public origin of this deployment, for links that leave the app (QR codes, share links).
 * Prefers NEXT_PUBLIC_APP_URL; falls back to the request's forwarded host.
 */
export async function getAppOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
