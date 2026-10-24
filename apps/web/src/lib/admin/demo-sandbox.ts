import { cookies, headers } from "next/headers";
import { cookieNeedsSecure } from "@/lib/guest/session";

/**
 * Which in-memory demo venue this browser edits (see `lib/demo/admin-store`). The cookie is a
 * random id with no meaning outside the demo store; it exists only so parallel browsers get
 * separate sandboxes. Never set when Supabase is configured.
 */
export const ADMIN_DEMO_COOKIE = "kj_admin_demo";
const MAX_AGE_SECONDS = 12 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readDemoSandboxId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ADMIN_DEMO_COOKIE)?.value;
  return value && UUID_RE.test(value) ? value : null;
}

/** Only callable from a Server Action: mints the id on first use and stores it in the cookie. */
export async function ensureDemoSandboxId(): Promise<string> {
  const existing = await readDemoSandboxId();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  store.set(ADMIN_DEMO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieNeedsSecure({
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      host: requestHeaders.get("host"),
      nodeEnv: process.env.NODE_ENV,
    }),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return id;
}
