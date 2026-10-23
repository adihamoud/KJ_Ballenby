import { readSupabaseEnv } from "@kj/db";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

// Session depends on cookies and the live night; never prerender.
export const dynamic = "force-dynamic";

/**
 * The DJ console requires a signed-in venue staff member. Without Supabase configured
 * there is no way to sign in, so the console runs on the in-memory demo night instead
 * (same fallback the guest catalog uses).
 */
export default async function DjLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (readSupabaseEnv()) {
    const user = await getCurrentUser();
    if (!user) redirect({ href: "/login", locale });
  }
  return <>{children}</>;
}
