import { redirect } from "@/i18n/navigation";

/** The queue moved into the DJ tab; old links and bookmarks land there. */
export default async function AdminQueueRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/admin/dj", locale });
}
