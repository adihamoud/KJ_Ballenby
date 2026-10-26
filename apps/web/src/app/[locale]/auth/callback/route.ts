import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * OAuth / magic-link callback. Supabase redirects here with a `code`;
 * we exchange it for a session cookie and send the user on.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), `/${locale}/app`);

  if (code) {
    const supabase = await createServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL(`/${locale}/login?error=auth`, url.origin));
}
