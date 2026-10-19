import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@kj/db";
import { readSupabaseEnv } from "@kj/db";

/**
 * Supabase client for server components, route handlers and server actions.
 * Returns null when Supabase is not configured so pages can render a setup hint
 * instead of crashing.
 */
export async function createServerSupabase() {
  const env = readSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

export async function getCurrentUser() {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
