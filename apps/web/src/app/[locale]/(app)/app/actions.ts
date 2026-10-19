"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";

export type CreateGroupState = {
  error?: "generic" | "invalidName" | "noOpenNight" | "notParticipant";
};

/** Leave the current group. RLS only lets a user delete their own membership. */
export async function leaveGroup(formData: FormData): Promise<void> {
  const groupId = String(formData.get("groupId") ?? "");
  const supabase = await createServerSupabase();
  if (!supabase || !groupId) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", user.id);
  revalidatePath(`/${await getLocale()}/app`);
}

/** Create an ad hoc group at the guest's table and move them into it (RPC create_group). */
export async function createGroup(
  _prev: CreateGroupState,
  formData: FormData,
): Promise<CreateGroupState> {
  const name = String(formData.get("name") ?? "").trim();
  const tableId = String(formData.get("tableId") ?? "") || null;
  if (!name) return { error: "invalidName" };

  const supabase = await createServerSupabase();
  if (!supabase) return { error: "generic" };

  const { data, error } = await supabase.rpc("create_group", {
    p_name: name,
    p_table_id: tableId,
  });
  const result = data?.[0];
  if (error || !result) return { error: "generic" };

  switch (result.status) {
    case "created":
      revalidatePath(`/${await getLocale()}/app`);
      return {};
    case "invalid_name":
      return { error: "invalidName" };
    case "no_open_night":
      return { error: "noOpenNight" };
    case "not_participant":
      return { error: "notParticipant" };
  }
}
