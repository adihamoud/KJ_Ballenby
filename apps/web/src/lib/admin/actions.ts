"use server";

import { revalidatePath } from "next/cache";
import type { Json, VenueTableRow } from "@kj/db";
import type { QueueRulesConfig } from "@kj/queue-engine";
import { getDemoVenue, setDemoVenue } from "@/lib/demo/admin-store";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SettingsState, TableActionError, TableActionState } from "./action-state";
import { ensureDemoSandboxId } from "./demo-sandbox";
import { generateJoinCode, normalizeTableLabel } from "./join-code";
import { normalizeVenueName, rulesFromForm } from "./rules-form";
import { loadAdminVenue } from "./venue";
import type { AdminVenue } from "./venue";

/**
 * Server Actions behind the admin pages. Every write goes through the signed-in user's own
 * Supabase session, so RLS (`is_venue_staff(venue_id, {owner, admin})`) is the authorization
 * check; there is no service role here. Without Supabase the in-memory demo venue of this
 * browser's sandbox is edited instead, so the pages stay testable.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";
const JOIN_CODE_ATTEMPTS = 6;

type VenueGate = { ok: true; venue: AdminVenue } | { ok: false; error: "notAdmin" | "unavailable" };

async function gate(): Promise<VenueGate> {
  const loaded = await loadAdminVenue();
  if (loaded.ok) return loaded;
  return { ok: false, error: loaded.reason === "unavailable" ? "unavailable" : "notAdmin" };
}

function refresh() {
  revalidatePath("/[locale]/admin", "layout");
}

function tableFailure(prev: TableActionState, error: TableActionError, label?: string) {
  return { error, version: prev.version, ...(label !== undefined ? { label } : {}) };
}

function tableSuccess(prev: TableActionState): TableActionState {
  refresh();
  return { error: null, version: prev.version + 1 };
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function tableIdField(formData: FormData): string | null {
  const id = stringField(formData, "tableId");
  return UUID_RE.test(id) ? id : null;
}

function hasLabel(
  tables: readonly Pick<VenueTableRow, "id" | "label">[],
  label: string,
  exceptId?: string,
) {
  const wanted = label.toLocaleLowerCase();
  return tables.some((t) => t.id !== exceptId && t.label.toLocaleLowerCase() === wanted);
}

async function demoWrite(
  mutate: (state: ReturnType<typeof getDemoVenue>) => TableActionError | null,
): Promise<TableActionError | null> {
  const sandboxId = await ensureDemoSandboxId();
  const state = structuredClone(getDemoVenue(sandboxId));
  const error = mutate(state);
  if (!error) setDemoVenue(sandboxId, state);
  return error;
}

/** Add a table with a fresh join code. Labels must be unique within the venue (case-insensitive). */
export async function createTableAction(
  prev: TableActionState,
  formData: FormData,
): Promise<TableActionState> {
  const rawLabel = stringField(formData, "label");
  const label = normalizeTableLabel(rawLabel);
  if (!label) return tableFailure(prev, "labelRequired", rawLabel);

  const gated = await gate();
  if (!gated.ok) return tableFailure(prev, gated.error, rawLabel);
  const { venue } = gated;

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    const error = await demoWrite((state) => {
      if (hasLabel(state.tables, label)) return "duplicateLabel";
      const taken = new Set(state.tables.map((t) => t.join_code));
      let code = generateJoinCode();
      while (taken.has(code)) code = generateJoinCode();
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      state.tables.push({
        id,
        venue_id: venue.id,
        label,
        join_code: code,
        qr_token: id,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
      return null;
    });
    return error ? tableFailure(prev, error, rawLabel) : tableSuccess(prev);
  }

  const existing = await supabase.from("venue_tables").select("id, label").eq("venue_id", venue.id);
  if (existing.error) return failed(prev, "list venue_tables", existing.error.message, rawLabel);
  if (hasLabel(existing.data, label)) return tableFailure(prev, "duplicateLabel", rawLabel);

  for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt++) {
    const { error } = await supabase
      .from("venue_tables")
      .insert({ venue_id: venue.id, label, join_code: generateJoinCode() });
    if (!error) return tableSuccess(prev);
    if (error.code !== UNIQUE_VIOLATION) {
      return failed(prev, "insert venue_tables", error.message, rawLabel);
    }
  }
  return tableFailure(prev, "codeExhausted", rawLabel);
}

export async function renameTableAction(
  prev: TableActionState,
  formData: FormData,
): Promise<TableActionState> {
  const tableId = tableIdField(formData);
  if (!tableId) return tableFailure(prev, "notFound");
  const rawLabel = stringField(formData, "label");
  const label = normalizeTableLabel(rawLabel);
  if (!label) return tableFailure(prev, "labelRequired", rawLabel);

  const gated = await gate();
  if (!gated.ok) return tableFailure(prev, gated.error, rawLabel);
  const { venue } = gated;

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    const error = await demoWrite((state) => {
      const table = state.tables.find((t) => t.id === tableId);
      if (!table) return "notFound";
      if (hasLabel(state.tables, label, tableId)) return "duplicateLabel";
      table.label = label;
      table.updated_at = new Date().toISOString();
      return null;
    });
    return error ? tableFailure(prev, error, rawLabel) : tableSuccess(prev);
  }

  const existing = await supabase.from("venue_tables").select("id, label").eq("venue_id", venue.id);
  if (existing.error) return failed(prev, "list venue_tables", existing.error.message, rawLabel);
  if (!existing.data.some((t) => t.id === tableId)) return tableFailure(prev, "notFound");
  if (hasLabel(existing.data, label, tableId))
    return tableFailure(prev, "duplicateLabel", rawLabel);

  const { error } = await supabase
    .from("venue_tables")
    .update({ label, updated_at: new Date().toISOString() })
    .eq("id", tableId)
    .eq("venue_id", venue.id);
  if (error) return failed(prev, "rename venue_tables", error.message, rawLabel);
  return tableSuccess(prev);
}

/** Deactivate (guests can no longer join; QR and code stop resolving) or reactivate a table. */
export async function setTableActiveAction(
  prev: TableActionState,
  formData: FormData,
): Promise<TableActionState> {
  const tableId = tableIdField(formData);
  if (!tableId) return tableFailure(prev, "notFound");
  const active = stringField(formData, "active") === "1";

  const gated = await gate();
  if (!gated.ok) return tableFailure(prev, gated.error);
  const { venue } = gated;

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    const error = await demoWrite((state) => {
      const table = state.tables.find((t) => t.id === tableId);
      if (!table) return "notFound";
      table.is_active = active;
      table.updated_at = new Date().toISOString();
      return null;
    });
    return error ? tableFailure(prev, error) : tableSuccess(prev);
  }

  const { data, error } = await supabase
    .from("venue_tables")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", tableId)
    .eq("venue_id", venue.id)
    .select("id")
    .maybeSingle();
  if (error) return failed(prev, "update venue_tables", error.message);
  if (!data) return tableFailure(prev, "notFound");
  return tableSuccess(prev);
}

/** Replace the typed join code. The QR token is unchanged, so printed sheets keep working. */
export async function regenerateJoinCodeAction(
  prev: TableActionState,
  formData: FormData,
): Promise<TableActionState> {
  const tableId = tableIdField(formData);
  if (!tableId) return tableFailure(prev, "notFound");

  const gated = await gate();
  if (!gated.ok) return tableFailure(prev, gated.error);
  const { venue } = gated;

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    const error = await demoWrite((state) => {
      const table = state.tables.find((t) => t.id === tableId);
      if (!table) return "notFound";
      const taken = new Set(state.tables.map((t) => t.join_code));
      let code = generateJoinCode();
      while (taken.has(code)) code = generateJoinCode();
      table.join_code = code;
      table.updated_at = new Date().toISOString();
      return null;
    });
    return error ? tableFailure(prev, error) : tableSuccess(prev);
  }

  for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("venue_tables")
      .update({ join_code: generateJoinCode(), updated_at: new Date().toISOString() })
      .eq("id", tableId)
      .eq("venue_id", venue.id)
      .select("id")
      .maybeSingle();
    if (!error) return data ? tableSuccess(prev) : tableFailure(prev, "notFound");
    if (error.code !== UNIQUE_VIOLATION) {
      return failed(prev, "regenerate join_code", error.message);
    }
  }
  return tableFailure(prev, "codeExhausted");
}

/** Venue name and queue rules. Rules are validated by the engine's own `parseRules`. */
export async function saveSettingsAction(
  prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  void prev;
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  const echo = { values };

  const name = normalizeVenueName(values.name);
  if (!name) return { error: "nameRequired", invalid: [], saved: false, ...echo };
  const parsed = rulesFromForm(formData);
  if (!parsed.ok) return { error: "invalidFields", invalid: parsed.invalid, saved: false, ...echo };

  const gated = await gate();
  if (!gated.ok) return { error: gated.error, invalid: [], saved: false, ...echo };
  const { venue } = gated;

  const supabase = await createServerSupabase();
  if (!supabase || venue.mode === "demo") {
    const sandboxId = await ensureDemoSandboxId();
    const state = structuredClone(getDemoVenue(sandboxId));
    state.venue.name = name;
    state.rules = parsed.rules;
    setDemoVenue(sandboxId, state);
    refresh();
    return { error: null, invalid: [], saved: true };
  }

  const { data: auth } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  if (name !== venue.name) {
    const { error } = await supabase
      .from("venues")
      .update({ name, updated_at: now })
      .eq("id", venue.id);
    if (error) return settingsFailed("update venues", error.message, echo);
  }
  const { error } = await supabase.from("queue_rules").upsert(
    {
      venue_id: venue.id,
      config: rulesToJson(parsed.rules),
      updated_by: auth.user?.id ?? null,
      updated_at: now,
    },
    { onConflict: "venue_id" },
  );
  if (error) return settingsFailed("upsert queue_rules", error.message, echo);
  refresh();
  return { error: null, invalid: [], saved: true };
}

function rulesToJson(rules: QueueRulesConfig): Json {
  // `QueueRulesConfig` is an interface (no index signature), so it needs an explicit step to
  // become the jsonb column type; every value is a string, number, boolean or null.
  return { ...rules } as unknown as Json;
}

function failed(
  prev: TableActionState,
  step: string,
  message: string,
  label?: string,
): TableActionState {
  console.error(`admin action: ${step} failed`, { message });
  return tableFailure(prev, "unavailable", label);
}

function settingsFailed(
  step: string,
  message: string,
  echo: { values: Record<string, string> },
): SettingsState {
  console.error(`admin settings: ${step} failed`, { message });
  return { error: "unavailable", invalid: [], saved: false, ...echo };
}
