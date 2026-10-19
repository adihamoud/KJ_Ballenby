import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, GroupRow, NightRow, VenueRole, VenueRow, VenueTableRow } from "@kj/db";

export type Supabase = SupabaseClient<Database>;

export interface StaffVenue {
  venue: Pick<VenueRow, "id" | "name" | "slug">;
  role: VenueRole;
}

/** Venues the user is staff of, with their role, ordered by venue name. */
export async function getStaffVenues(supabase: Supabase, userId: string): Promise<StaffVenue[]> {
  const { data: memberships } = await supabase
    .from("venue_members")
    .select("venue_id, role")
    .eq("user_id", userId);
  if (!memberships?.length) return [];

  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, slug")
    .in(
      "id",
      memberships.map((m) => m.venue_id),
    )
    .order("name");

  const roleByVenue = new Map(memberships.map((m) => [m.venue_id, m.role]));
  return (venues ?? []).flatMap((venue) => {
    const role = roleByVenue.get(venue.id);
    return role ? [{ venue, role }] : [];
  });
}

/**
 * Pick the venue a staff page works on: the one in `?venue=` when the user is staff
 * there, otherwise the first by name.
 */
export function pickStaffVenue(venues: StaffVenue[], preferredId?: string): StaffVenue | null {
  return venues.find((v) => v.venue.id === preferredId) ?? venues[0] ?? null;
}

export const ADMIN_ROLES: readonly VenueRole[] = ["owner", "admin"];

export async function getVenueTables(
  supabase: Supabase,
  venueId: string,
): Promise<VenueTableRow[]> {
  const { data } = await supabase
    .from("venue_tables")
    .select("*")
    .eq("venue_id", venueId)
    .order("label");
  return data ?? [];
}

export async function getOpenNight(supabase: Supabase, venueId: string): Promise<NightRow | null> {
  const { data } = await supabase
    .from("nights")
    .select("*")
    .eq("venue_id", venueId)
    .eq("status", "open")
    .maybeSingle();
  return data ?? null;
}

export interface GroupMember {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  joinedAt: string;
}

export interface GuestSession {
  venue: Pick<VenueRow, "id" | "name">;
  night: Pick<NightRow, "id" | "started_at">;
  group: GroupRow;
  table: Pick<VenueTableRow, "id" | "label"> | null;
  members: GroupMember[];
}

/**
 * The guest's current place: the active group they belong to in an open night, with the
 * venue, table and member list. Null when they have not joined a table.
 * Several small queries instead of a nested select so each one stays typed.
 */
export async function getGuestSession(
  supabase: Supabase,
  userId: string,
): Promise<GuestSession | null> {
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);
  if (!memberships?.length) return null;

  const { data: groups } = await supabase
    .from("groups")
    .select("*")
    .in(
      "id",
      memberships.map((m) => m.group_id),
    )
    .eq("is_active", true);
  if (!groups?.length) return null;

  const { data: nights } = await supabase
    .from("nights")
    .select("id, started_at, venue_id")
    .in(
      "id",
      groups.map((g) => g.night_id),
    )
    .eq("status", "open")
    .order("started_at", { ascending: false });
  const night = nights?.[0];
  if (!night) return null;

  const group = groups.find((g) => g.night_id === night.id);
  if (!group) return null;

  const [{ data: venue }, { data: table }, members] = await Promise.all([
    supabase.from("venues").select("id, name").eq("id", group.venue_id).maybeSingle(),
    group.table_id
      ? supabase.from("venue_tables").select("id, label").eq("id", group.table_id).maybeSingle()
      : Promise.resolve({ data: null }),
    getGroupMembers(supabase, group.id),
  ]);
  if (!venue) return null;

  return {
    venue,
    night: { id: night.id, started_at: night.started_at },
    group,
    table: table ?? null,
    members,
  };
}

/** Members of a group with display names. Used server-side and by the realtime refetch. */
export async function getGroupMembers(supabase: Supabase, groupId: string): Promise<GroupMember[]> {
  const { data: rows } = await supabase
    .from("group_members")
    .select("user_id, joined_at")
    .eq("group_id", groupId)
    .order("joined_at");
  if (!rows?.length) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in(
      "id",
      rows.map((r) => r.user_id),
    );
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((r) => {
    const profile = byId.get(r.user_id);
    return {
      userId: r.user_id,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      joinedAt: r.joined_at,
    };
  });
}
