export type {
  AppLocale,
  CatalogImportRow,
  Database,
  GroupMemberRow,
  GroupRow,
  ImportStatus,
  InsertOf,
  Json,
  NightRow,
  NightStatus,
  ProfileRow,
  QueueEntryRow,
  QueueRulesRow,
  RequestStatus,
  ResolvedTableRow,
  SearchSongRow,
  SongVideoRow,
  SongVideoSummary,
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
  const url = normalizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Reduce whatever was pasted from the Supabase dashboard to the bare project URL.
 * Accepts `https://ref.supabase.co`, with a trailing slash, or a service path such as
 * `https://ref.supabase.co/rest/v1/` (the REST endpoint shown in the API settings page).
 * Returns null for empty or unparseable input.
 */
export function normalizeSupabaseUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
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
