import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "@kj/db";
import { readSupabaseEnv } from "@kj/db";

/**
 * Refresh the Supabase auth session on every request so server components
 * see a valid user. Cookies set by Supabase are copied onto the response
 * produced by the i18n middleware.
 *
 * When Supabase is not configured (local preview without secrets, CI e2e),
 * the request passes through untouched.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const env = readSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching the user triggers the token refresh when needed.
  await supabase.auth.getUser();
  return response;
}
