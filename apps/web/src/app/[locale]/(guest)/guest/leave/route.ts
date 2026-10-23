import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale } from "@kj/i18n";
import { clearGuestSession } from "@/lib/guest/session";

/** Leave the table: drop the guest cookie and go back to the join page. */
export async function POST(request: NextRequest, context: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await context.params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  await clearGuestSession();
  return NextResponse.redirect(new URL(`/${locale}/join`, request.url), { status: 303 });
}
