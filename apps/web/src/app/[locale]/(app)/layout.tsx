import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

// Session depends on cookies: never prerender these routes.
export const dynamic = "force-dynamic";

/** Everything under (app) requires a signed-in user. */
export default async function AuthenticatedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale });
  return <>{children}</>;
}
