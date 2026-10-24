"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@kj/db";
import { requireSupabaseEnv } from "@kj/db";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser-side Supabase client (singleton per tab). */
export function getBrowserSupabase() {
  if (!client) {
    const env = requireSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    client = createBrowserClient<Database>(env.url, env.anonKey);
  }
  return client;
}
