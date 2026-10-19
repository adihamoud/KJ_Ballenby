"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";

export type NightActionResult = { ok: true } | { ok: false; error: "generic" };

/** Open the venue's night (RPC open_night; idempotent, staff only). */
export async function openNight(venueId: string): Promise<NightActionResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "generic" };

  const { error } = await supabase.rpc("open_night", { p_venue_id: venueId });
  if (error) return { ok: false, error: "generic" };

  revalidatePath(`/${await getLocale()}/dj`);
  return { ok: true };
}

/** Close an open night (RPC close_night; staff only). */
export async function closeNight(nightId: string): Promise<NightActionResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: "generic" };

  const { error } = await supabase.rpc("close_night", { p_night_id: nightId });
  if (error) return { ok: false, error: "generic" };

  revalidatePath(`/${await getLocale()}/dj`);
  return { ok: true };
}
