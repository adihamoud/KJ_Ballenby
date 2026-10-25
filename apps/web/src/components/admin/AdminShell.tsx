"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DjConsole } from "@/components/dj/DjConsole";
import { usePathname } from "@/i18n/navigation";
import type { DjSnapshot } from "@/lib/dj/types";

const DJ_PATH = "/admin/dj";

/**
 * Frame of the venue admin. It hosts the DJ console: the console mounts the first time the DJ tab
 * is opened and then stays mounted across admin tabs (layouts persist between pages), so music
 * keeps playing while the owner checks the tables board or settings; elsewhere it runs offscreen
 * with a small now-playing bar. Wide pages (DJ, tables tonight) get a wider frame.
 */
export function AdminShell({
  djInitial,
  children,
}: {
  djInitial: DjSnapshot | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const onDj = pathname === DJ_PATH;
  const wide = onDj || pathname.startsWith("/admin/tonight");
  const [activated, setActivated] = useState(onDj);
  useEffect(() => {
    if (onDj) setActivated(true);
  }, [onDj]);

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full flex-col gap-6 px-4 py-6 print:max-w-none print:gap-0 print:p-0 ${
        wide ? "max-w-6xl" : "max-w-3xl"
      }`}
    >
      {children}
      {djInitial && activated && (
        <DjConsole initial={djInitial} embedded background={!onDj} tablesHref="/admin/tonight" />
      )}
      {!djInitial && onDj && (
        <main id="main" className="card flex flex-col gap-2 p-5">
          <p className="text-muted">{t("unavailable.body")}</p>
          <a href="?" className="btn btn-secondary self-start">
            {t("unavailable.retry")}
          </a>
        </main>
      )}
    </div>
  );
}
