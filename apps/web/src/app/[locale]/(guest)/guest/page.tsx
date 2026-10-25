import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { GuestHeader } from "@/components/guest/GuestHeader";
import { GuestNightProvider } from "@/components/GuestNightContext";
import { GuestQueue } from "@/components/GuestQueue";
import { SongSearch } from "@/components/SongSearch";
import { retryGuestIdentityAction } from "@/lib/guest/actions";
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

type NightStatus = "open" | "closed" | "gone" | "unknown";

const STATUS_DOT: Record<NightStatus, string> = {
  open: "live-dot",
  closed: "bg-warning",
  gone: "bg-danger",
  unknown: "bg-faint",
};

/** Guest home: the table you joined, your place in the queue, and the catalog to request from. */
export default async function GuestHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getGuestSession();
  if (!session) return redirect({ href: "/join", locale });

  const t = await getTranslations();
  const [live, catalog, night] = await Promise.all([
    resolveTable(session.joinCode, session.venueId),
    searchSongs(session.venueId, ""),
    loadGuestNight(session),
  ]);
  const status: NightStatus = live.ok
    ? live.table.night_open
      ? "open"
      : "closed"
    : live.reason === "not_found"
      ? "gone"
      : "unknown";

  const view = night.ok ? guestQueueView(night.night.snapshot, night.night.userId) : null;
  const canRequest = status === "open" && view !== null && view.nightOpen;
  const limits = night.ok ? sheetLimits(night.night.snapshot.rules) : null;
  const noIdentity = !night.ok && night.reason === "noIdentity";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-5">
      <GuestHeader brandLink={false} />

      <section className="card relative overflow-hidden p-5">
        <div
          aria-hidden="true"
          className="from-brand/25 to-brand-2/20 pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-gradient-to-br blur-2xl"
        />
        <p className="eyebrow text-brand">{session.venueName}</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">
          {t("guest.title", { table: session.tableLabel })}
        </h1>
        <p className="text-muted mt-1">{t("guest.joinedAs", { name: session.name })}</p>
      </section>

      <section
        className={`card flex gap-3 p-4 ${status === "open" ? "border-success/40" : ""}`}
        aria-live="polite"
      >
        {noIdentity ? (
          // No Supabase session behind the cookie: the sign-in is retried from here, not by
          // reloading (a reload never signs in again).
          <form action={retryGuestIdentityAction} className="flex w-full flex-col gap-3">
            <input type="hidden" name="locale" value={locale} />
            <p className="text-danger text-sm">{t("guest.queue.errors.noIdentity")}</p>
            <button type="submit" className="btn btn-primary">
              {t("guest.queue.retryIdentity")}
            </button>
          </form>
        ) : (
          <>
            <span className="flex h-6 shrink-0 items-center">
              <span className={`size-2.5 rounded-full ${STATUS_DOT[status]}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`font-bold ${status === "gone" ? "text-danger" : ""}`}>
                {t(`guest.statusLabel.${status}`)}
              </p>
              <p className="text-muted text-sm leading-snug">{t(`guest.status.${status}`)}</p>
              {status === "open" && !night.ok && (
                <p className="text-danger mt-2 text-sm">
                  {t(`guest.queue.errors.${night.reason}`)}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {view ? (
        <GuestNightProvider initial={view}>
          <GuestQueue />
          <SongSearch
            initialSongs={catalog.ok ? catalog.songs : []}
            initialError={!catalog.ok}
            browseOnly={!canRequest && status !== "gone"}
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
            <h2 className="text-lg font-bold">{t("guest.queue.title")}</h2>
            <p className="text-muted text-sm">{t("guest.queue.closed")}</p>
          </section>
          <SongSearch
            initialSongs={catalog.ok ? catalog.songs : []}
            initialError={!catalog.ok}
            browseOnly={status !== "gone"}
          />
        </>
      )}

      <footer className="mt-auto flex flex-col gap-2 pt-4">
        <Link href="/join" className="btn btn-secondary">
          {t("guest.switchTable")}
        </Link>
        <form action={`/${locale}/guest/leave`} method="post">
          <button type="submit" className="btn btn-ghost btn-sm w-full">
            {t("guest.leave")}
          </button>
        </form>
      </footer>
    </main>
  );
}
