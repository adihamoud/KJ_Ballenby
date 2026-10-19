/**
 * Database types.
 *
 * Hand-written to match the files in supabase/migrations.
 * Regenerate from a running database with `pnpm db:types` once the Supabase CLI
 * and Docker are available; the generated file replaces this one.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type VenueRole = "owner" | "admin" | "dj";
export type NightStatus = "open" | "closed";
export type RequestStatus =
  "pending" | "approved" | "queued" | "now_singing" | "done" | "skipped" | "cancelled";
export type ImportStatus = "pending" | "processing" | "done" | "failed";
export type AppLocale = "he" | "en";
export type GroupKind = "table" | "adhoc";

// Mapped type: interfaces have no implicit index signature and would fail the
// `Record<string, unknown>` constraint supabase-js puts on table rows.
type Row<T> = { [K in keyof T]: T[K] };
type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

export interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  locale: AppLocale;
  created_at: string;
  updated_at: string;
}

export interface VenueRow {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  default_locale: AppLocale;
  settings: Json;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VenueMemberRow {
  venue_id: string;
  user_id: string;
  role: VenueRole;
  created_at: string;
}

export interface VenueTableRow {
  id: string;
  venue_id: string;
  label: string;
  join_code: string;
  qr_token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NightRow {
  id: string;
  venue_id: string;
  started_at: string;
  ended_at: string | null;
  closes_at: string | null;
  status: NightStatus;
  rules_snapshot: Json;
  created_at: string;
  updated_at: string;
}

export interface GroupRow {
  id: string;
  venue_id: string;
  night_id: string;
  table_id: string | null;
  name: string;
  created_by: string;
  kind: GroupKind;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupMemberRow {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface SongRow {
  id: string;
  venue_id: string;
  title: string;
  artist: string;
  language: string | null;
  duration_sec: number | null;
  external_ref: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SongRequestRow {
  id: string;
  venue_id: string;
  night_id: string;
  song_id: string;
  requested_by: string;
  group_id: string | null;
  table_id: string | null;
  singers: string[];
  note: string | null;
  status: RequestStatus;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface QueueEntryRow {
  id: string;
  venue_id: string;
  night_id: string;
  request_id: string;
  position: number;
  locked_by_host: boolean;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueRulesRow {
  venue_id: string;
  config: Json;
  updated_by: string | null;
  updated_at: string;
}

export interface CatalogImportRow {
  id: string;
  venue_id: string;
  uploaded_by: string;
  storage_path: string;
  status: ImportStatus;
  stats: Json;
  error: string | null;
  created_at: string;
  updated_at: string;
}

type Timestamps = "created_at" | "updated_at";

/** Row returned by rpc resolve_table(p_code). Empty result = unknown or inactive code. */
export interface ResolvedTable {
  venue_id: string;
  venue_name: string;
  venue_slug: string;
  table_id: string;
  table_label: string;
  /** Null when the venue has no open night. */
  night_id: string | null;
}

export type JoinStatus = "joined" | "not_found" | "no_open_night";

/** Row returned by rpc join_table(p_code) and join_group(p_group_id). */
export interface JoinResult {
  status: JoinStatus;
  venue_id: string | null;
  venue_name: string | null;
  table_id: string | null;
  table_label: string | null;
  night_id: string | null;
  group_id: string | null;
  group_name: string | null;
}

export type CreateGroupStatus = "created" | "invalid_name" | "no_open_night" | "not_participant";

/** Row returned by rpc create_group(p_name, p_table_id). */
export interface CreateGroupResult {
  status: CreateGroupStatus;
  group_id: string | null;
  group_name: string | null;
  night_id: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Row<ProfileRow>;
        Insert: Insert<ProfileRow, Timestamps | "display_name" | "avatar_url" | "phone" | "locale">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      venues: {
        Row: Row<VenueRow>;
        Insert: Insert<
          VenueRow,
          Timestamps | "id" | "timezone" | "default_locale" | "settings" | "is_active"
        >;
        Update: Partial<VenueRow>;
        Relationships: [];
      };
      venue_members: {
        Row: Row<VenueMemberRow>;
        Insert: Insert<VenueMemberRow, "created_at">;
        Update: Partial<VenueMemberRow>;
        Relationships: [];
      };
      venue_tables: {
        Row: Row<VenueTableRow>;
        Insert: Insert<VenueTableRow, Timestamps | "id" | "join_code" | "qr_token" | "is_active">;
        Update: Partial<VenueTableRow>;
        Relationships: [];
      };
      nights: {
        Row: Row<NightRow>;
        Insert: Insert<
          NightRow,
          Timestamps | "id" | "started_at" | "ended_at" | "closes_at" | "status" | "rules_snapshot"
        >;
        Update: Partial<NightRow>;
        Relationships: [];
      };
      groups: {
        Row: Row<GroupRow>;
        Insert: Insert<GroupRow, Timestamps | "id" | "table_id" | "kind" | "is_active">;
        Update: Partial<GroupRow>;
        Relationships: [];
      };
      group_members: {
        Row: Row<GroupMemberRow>;
        Insert: Insert<GroupMemberRow, "joined_at">;
        Update: Partial<GroupMemberRow>;
        Relationships: [];
      };
      songs: {
        Row: Row<SongRow>;
        Insert: Insert<
          SongRow,
          Timestamps | "id" | "language" | "duration_sec" | "external_ref" | "is_active"
        >;
        Update: Partial<SongRow>;
        Relationships: [];
      };
      song_requests: {
        Row: Row<SongRequestRow>;
        Insert: Insert<
          SongRequestRow,
          Timestamps | "id" | "group_id" | "table_id" | "singers" | "note" | "status" | "priority"
        >;
        Update: Partial<SongRequestRow>;
        Relationships: [];
      };
      queue_entries: {
        Row: Row<QueueEntryRow>;
        Insert: Insert<
          QueueEntryRow,
          Timestamps | "id" | "locked_by_host" | "started_at" | "ended_at"
        >;
        Update: Partial<QueueEntryRow>;
        Relationships: [];
      };
      queue_rules: {
        Row: Row<QueueRulesRow>;
        Insert: Insert<QueueRulesRow, "updated_at" | "updated_by" | "config">;
        Update: Partial<QueueRulesRow>;
        Relationships: [];
      };
      catalog_imports: {
        Row: Row<CatalogImportRow>;
        Insert: Insert<CatalogImportRow, Timestamps | "id" | "status" | "stats" | "error">;
        Update: Partial<CatalogImportRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_venue_staff: {
        Args: { p_venue_id: string; p_roles?: VenueRole[] };
        Returns: boolean;
      };
      is_night_participant: {
        Args: { p_night_id: string };
        Returns: boolean;
      };
      is_group_member: {
        Args: { p_group_id: string };
        Returns: boolean;
      };
      is_venue_participant: {
        Args: { p_venue_id: string };
        Returns: boolean;
      };
      resolve_table: {
        Args: { p_code: string };
        Returns: ResolvedTable[];
      };
      join_table: {
        Args: { p_code: string };
        Returns: JoinResult[];
      };
      join_group: {
        Args: { p_group_id: string };
        Returns: JoinResult[];
      };
      create_group: {
        Args: { p_name: string; p_table_id?: string | null };
        Returns: CreateGroupResult[];
      };
      open_night: {
        Args: { p_venue_id: string };
        Returns: NightRow[];
      };
      close_night: {
        Args: { p_night_id: string };
        Returns: NightRow[];
      };
    };
    Enums: {
      venue_role: VenueRole;
      night_status: NightStatus;
      request_status: RequestStatus;
      import_status: ImportStatus;
      app_locale: AppLocale;
      group_kind: GroupKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertOf<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateOf<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
