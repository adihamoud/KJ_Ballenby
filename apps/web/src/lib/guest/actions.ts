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
 * is signed in anonymously here, so `auth.uid()` exists before the first song request. When
 * that sign-in fails (Supabase rate-limits anonymous sign-ins per IP, and a venue's guests
 * share one), the form shows an error and nothing is stored, so the guest simply tries again
 * instead of landing on a page that can neither show the queue nor request. If the night is
 * already open the guest also joins the table's group (`join_table`), which is what
 * `is_night_participant` checks; that part stays best effort (the loader retries it).
 */
export async function joinTableAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const rawLocale = formData.get("locale");
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;

  const rawCode = stringField(formData, "code");
  const rawName = stringField(formData, "name");
  const echo = { code: rawCode, name: rawName };

  const code = normalizeJoinCode(rawCode);
  if (!code) return { error: "invalidCode", ...echo };

  const name = normalizeGuestName(rawName);
  if (!name) return { error: "nameRequired", ...echo };

  const result = await resolveTable(code);
  if (!result.ok) {
    return { error: result.reason === "not_found" ? "notFound" : "unavailable", ...echo };
  }

  const { table } = result;
  const previous = await getGuestSession();
  const identity = await ensureGuestIdentity(name, table.table_id, table.night_open);
  if (identity === "failed") return { error: "identity", ...echo };
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

/**
 * Retry the anonymous sign-in for a guest who already holds a table cookie but no Supabase
 * session (a second device with a copied cookie, or a join that happened while sign-ins were
 * rate-limited before this build). Posted by the "Try again" button on the guest home.
 */
export async function retryGuestIdentityAction(formData: FormData): Promise<void> {
  const rawLocale = formData.get("locale");
  const locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const session = await getGuestSession();
  if (!session) return redirect({ href: "/join", locale });
  const live = await resolveTable(session.joinCode, session.venueId);
  await ensureGuestIdentity(session.name, session.tableId, live.ok && live.table.night_open);
  return redirect({ href: "/guest", locale });
}

async function ensureGuestIdentity(
  name: string,
  tableId: string,
  nightOpen: boolean,
): Promise<"ok" | "failed"> {
  const supabase = await createServerSupabase();
  if (!supabase) return "ok";

  const { data: existing } = await supabase.auth.getUser();
  if (!existing.user) {
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { name } } });
    if (error) {
      console.error("anonymous sign-in failed", { message: error.message, status: error.status });
      return "failed";
    }
  }
  if (!nightOpen) return "ok";
  const { error } = await supabase.rpc("join_table", { p_table_id: tableId });
  if (error) console.error("join_table failed", { tableId, message: error.message });
  return "ok";
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
