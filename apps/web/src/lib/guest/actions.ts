"use server";

import { defaultLocale, isLocale } from "@kj/i18n";
import { redirect } from "@/i18n/navigation";
import { normalizeGuestName, normalizeJoinCode } from "./join-code";
import type { JoinState } from "./join-state";
import { resolveTable } from "./resolve";
import { setGuestSession } from "./session";

/**
 * Server Action behind the join form (typed code) and the QR confirm screen.
 * On success it stores the guest session cookie and redirects to the guest home.
 */
export async function joinTableAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const rawLocale = formData.get("locale");
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;

  const code = normalizeJoinCode(stringField(formData, "code"));
  if (!code) return { error: "invalidCode" };

  const name = normalizeGuestName(stringField(formData, "name"));
  if (!name) return { error: "nameRequired" };

  const result = await resolveTable(code);
  if (!result.ok) return { error: result.reason === "not_found" ? "notFound" : "unavailable" };

  const { table } = result;
  await setGuestSession({
    v: 1,
    tableId: table.table_id,
    tableLabel: table.table_label,
    joinCode: table.join_code,
    venueId: table.venue_id,
    venueName: table.venue_name,
    venueSlug: table.venue_slug,
    name,
    joinedAt: new Date().toISOString(),
  });

  return redirect({ href: "/guest", locale });
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
