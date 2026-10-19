import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { VenueSwitcher } from "@/components/VenueSwitcher";
import { getOpenNight, getStaffVenues, pickStaffVenue } from "@/lib/supabase/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { NightControl } from "./NightControl";

export default async function DjDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ venue?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { venue: venueParam } = await searchParams;
  const t = await getTranslations("dj");
  const format = await getFormatter();

  const supabase = await createServerSupabase();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const venues = supabase && user ? await getStaffVenues(supabase, user.id) : [];
  const current = pickStaffVenue(venues, venueParam);
  const night = supabase && current ? await getOpenNight(supabase, current.venue.id) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <VenueSwitcher venues={venues} currentId={current?.venue.id} pathname="/dj" />
        </div>
        {current && (
          <div
            className="card flex flex-wrap items-center justify-between gap-3 p-4"
            data-testid="night-header"
          >
            <div>
              <p className="font-semibold">{current.venue.name}</p>
              <p className="text-muted text-sm">
                {night
                  ? t("night.open", {
                      time: format.dateTime(new Date(night.started_at), { timeStyle: "short" }),
                    })
                  : t("night.closed")}
              </p>
            </div>
            <NightControl venueId={current.venue.id} nightId={night?.id ?? null} />
          </div>
        )}
      </header>

      <section className="card p-5">
        <p className="text-muted">{current ? t("queuePlaceholder") : t("notStaff")}</p>
      </section>
    </main>
  );
}
