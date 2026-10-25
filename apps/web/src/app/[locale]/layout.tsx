import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { dir } from "@kj/i18n";
import { VersionFooter } from "@/components/VersionFooter";
import { SkipLink } from "@/components/a11y/SkipLink";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/a11y/preferences";
import { routing } from "@/i18n/routing";
import "../globals.css";

// Heebo covers Hebrew and Latin in one family (variable weight), so headings and body text
// look the same in both locales. Self-hosted by next/font: no request to Google at runtime.
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  display: "swap",
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: {
    default: "KJ Ballenby",
    template: "%s · KJ Ballenby",
  },
  description: "Karaoke queue for your table",
  applicationName: "KJ Ballenby",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KJ Ballenby",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // The boot script adds the accessibility menu's data-a11y-* attributes before hydration.
    <html lang={locale} dir={dir(locale)} className={heebo.variable} suppressHydrationWarning>
      <body className="safe-area min-h-dvh antialiased">
        {/* Applies saved accessibility settings before first paint (no jump to large text). */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
        <NextIntlClientProvider>
          <SkipLink />
          {children}
          {/* Inside the provider: its privacy and accessibility links are next-intl client
              components. */}
          <VersionFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
