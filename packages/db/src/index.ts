export type {
  AppLocale,
  CatalogImportRow,
  CreateGroupResult,
  CreateGroupStatus,
  Database,
  GroupKind,
  GroupMemberRow,
  GroupRow,
  ImportStatus,
  InsertOf,
  JoinResult,
  JoinStatus,
  Json,
  NightRow,
  NightStatus,
  ProfileRow,
  QueueEntryRow,
  QueueRulesRow,
  RequestStatus,
  ResolvedTable,
  SongRequestRow,
  SongRow,
  Tables,
  UpdateOf,
  VenueMemberRow,
  VenueRole,
  VenueRow,
  VenueTableRow,
} from "./database.types";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * Read the public Supabase settings from the environment.
 * Returns null when they are not configured so callers can degrade gracefully
 * (e.g. the marketing page and CI builds work without a Supabase project).
 */
export function readSupabaseEnv(
  env: Record<string, string | undefined> = process.env,
): SupabaseEnv | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabaseEnv(env?: Record<string, string | undefined>): SupabaseEnv {
  const found = readSupabaseEnv(env);
  if (!found) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  return found;
}
