import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { GuestNightProvider } from "@/components/GuestNightContext";
import { GuestQueue } from "@/components/GuestQueue";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SongSearch } from "@/components/SongSearch";
import { loadGuestNight } from "@/lib/guest/night";
import { guestQueueView, sheetLimits } from "@/lib/guest/queue-state";
import { resolveTable } from "@/lib/guest/resolve";
import { getGuestSession } from "@/lib/guest/session";
import { searchSongs } from "@/lib/guest/songs";

// Reads the guest cookie and the live night status; never prerender.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("guest");
  return { title: t("metaTitle") };
}

/** Guest home: the table you joined, your place in the queue, and the catalog to request from. */
export default async function GuestHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getGuestSession();
  if (!session) return redirect({ href: "/join", locale });

  const t = await getTranslations();
  const [live, catalog, night] = await Promise.all([
    resolveTable(session.joinCode),
    searchSongs(session.venueId, ""),
    loadGuestNight(session),
  ]);
  const status: "open" | "closed" | "gone" | "unknown" = live.ok
    ? live.table.night_open
      ? "open"
      : "closed"
    : live.reason === "not_found"
      ? "gone"
      : "unknown";

  const view = night.ok ? guestQueueView(night.night.snapshot, night.night.userId) : null;
  const canRequest = status === "open" && view !== null && view.nightOpen;
  const limits = night.ok ? sheetLimits(night.night.snapshot.rules) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold">{t("common.appName")}</span>
        <LocaleSwitcher />
      </header>

      <section className="card flex flex-col gap-1 p-5">
        <p className="text-brand text-sm font-semibold tracking-wide uppercase">
          {session.venueName}
        </p>
        <h1 className="text-3xl font-bold">{t("guest.title", { table: session.tableLabel })}</h1>
        <p className="text-muted">{t("guest.joinedAs", { name: session.name })}</p>
      </section>

      <section
        className={`card p-5 ${status === "open" ? "border-brand-2" : ""}`}
        aria-live="polite"
      >
        <p className={status === "gone" ? "text-danger" : "text-muted"}>
          {t(`guest.status.${status}`)}
        </p>
        {status === "open" && !night.ok && (
          <p className="text-danger mt-2 text-sm">{t(`guest.queue.errors.${night.reason}`)}</p>
        )}
      </section>

      {view ? (
        <GuestNightProvider initial={view}>
          <GuestQueue />
          <SongSearch
            initialSongs={catalog.ok ? catalog.songs : []}
            initialError={!catalog.ok}
            request={
              canRequest && limits
                ? { guestName: session.name, maxSingers: limits.maxSingers }
                : undefined
            }
          />
        </GuestNightProvider>
      ) : (
        <>
          <section className="card flex flex-col gap-2 p-5">
            <h2 className="text-lg font-semibold">{t("guest.queue.title")}</h2>
            <p className="text-muted text-sm">{t("guest.queue.closed")}</p>
          </section>
          <SongSearch initialSongs={catalog.ok ? catalog.songs : []} initialError={!catalog.ok} />
        </>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <Link href="/join" className="btn btn-secondary">
          {t("guest.switchTable")}
        </Link>
        <form action={`/${locale}/guest/leave`} method="post">
          <button type="submit" className="text-muted w-full py-2 text-sm underline">
            {t("guest.leave")}
          </button>
        </form>
      </div>
    </main>
  );
}
