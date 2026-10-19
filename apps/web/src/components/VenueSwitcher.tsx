import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { StaffVenue } from "@/lib/supabase/queries";

/** Links to switch the venue a staff page works on. Renders nothing for a single venue. */
export async function VenueSwitcher({
  venues,
  currentId,
  pathname,
}: {
  venues: StaffVenue[];
  currentId: string | undefined;
  pathname: "/dj" | "/admin" | "/admin/tables";
}) {
  if (venues.length < 2) return null;
  const t = await getTranslations("common");

  return (
    <nav aria-label={t("venue")} className="flex flex-wrap gap-2 text-sm">
      {venues.map(({ venue }) => (
        <Link
          key={venue.id}
          href={{ pathname, query: { venue: venue.id } }}
          className={`rounded-full border px-3 py-1 ${
            venue.id === currentId ? "border-brand-2 bg-surface-2" : "border-border text-muted"
          }`}
          aria-current={venue.id === currentId ? "page" : undefined}
        >
          {venue.name}
        </Link>
      ))}
    </nav>
  );
}
