import type { RulesField } from "./rules-form";

/** Why a table action failed; each has a message under `admin.tables.errors` in the catalogs. */
export type TableActionError =
  "labelRequired" | "duplicateLabel" | "codeExhausted" | "notFound" | "notAdmin" | "unavailable";

export interface TableActionState {
  error: TableActionError | null;
  /** Echo of the submitted label so uncontrolled inputs keep what the admin typed. */
  label?: string;
  /** Bumped on success so the form can reset its uncontrolled inputs. */
  version: number;
}

export const initialTableActionState: TableActionState = { error: null, version: 0 };

export type SettingsError = "nameRequired" | "invalidFields" | "notAdmin" | "unavailable";

export interface SettingsState {
  error: SettingsError | null;
  invalid: RulesField[];
  saved: boolean;
  /** Echo of the submission so the uncontrolled form keeps the admin's input after an error. */
  values?: Record<string, string>;
}

export const initialSettingsState: SettingsState = { error: null, invalid: [], saved: false };
