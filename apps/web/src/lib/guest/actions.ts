"use server";

import { defaultLocale, isLocale } from "@kj/i18n";
import { redirect } from "@/i18n/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeGuestName, normalizeJoinCode } from "./join-code";
import type { JoinState } from "./join-state";
import { resolveTable } from "./resolve";
import { getGuestSession, setGuestSession } from "./session";

/**
 * Server Action behind the join form (typed code) and the QR confirm screen.
 * On success it stores the guest session cookie and redirects to the guest home.
 *
 * Identity (ADR-009): when Supabase is configured and the phone has no session yet, the guest
 * is signed in anonymously here, so `auth.uid()` exists before the first song request. If the
 * night is already open the guest also joins the table's group (`join_table`), which is what
 * `is_night_participant` checks. Both steps are best effort: a failure still lets the guest in
 * to browse, and the request action retries them.
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
  const previous = await getGuestSession();
  await ensureGuestIdentity(name, table.table_id, table.night_open);
  await setGuestSession({
    v: 2,
    guestId: previous?.guestId ?? crypto.randomUUID(),
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

async function ensureGuestIdentity(name: string, tableId: string, nightOpen: boolean) {
  const supabase = await createServerSupabase();
  if (!supabase) return;

  const { data: existing } = await supabase.auth.getUser();
  if (!existing.user) {
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { name } } });
    if (error) {
      console.error("anonymous sign-in failed", { message: error.message });
      return;
    }
  }
  if (!nightOpen) return;
  const { error } = await supabase.rpc("join_table", { p_table_id: tableId });
  if (error) console.error("join_table failed", { tableId, message: error.message });
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
