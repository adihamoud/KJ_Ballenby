"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/admin", key: "overview", exact: true },
  { href: "/admin/queue", key: "queue", exact: false },
  { href: "/admin/tonight", key: "tonight", exact: false },
  { href: "/admin/tables", key: "tables", exact: false },
  { href: "/admin/qr", key: "qr", exact: false },
  { href: "/admin/settings", key: "settings", exact: false },
] as const;

/** Section tabs of the venue admin; hidden when printing the QR sheet. */
export function AdminNav({ mode, locale }: { mode: "live" | "demo"; locale: string }) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-2 print:hidden"
      data-testid="admin-nav"
    >
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              active ? "bg-brand-2 text-white" : "bg-surface-2 border-border text-muted border"
            }`}
          >
            {t(item.key)}
          </Link>
        );
      })}
      <span className="ms-auto flex items-center gap-2">
        <Link href="/dj" className="text-muted text-sm underline">
          {t("dj")}
        </Link>
        {mode === "live" && (
          <form action={`/${locale}/auth/signout`} method="post">
            <button type="submit" className="text-muted text-sm underline">
              {t("signOut")}
            </button>
          </form>
        )}
      </span>
    </nav>
  );
}
