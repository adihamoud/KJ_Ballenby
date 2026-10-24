"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { initialSettingsState } from "@/lib/admin/action-state";
import { saveSettingsAction } from "@/lib/admin/actions";
import { RULES_MIN, VENUE_NAME_MAX } from "@/lib/admin/rules-form";
import type { RulesField } from "@/lib/admin/rules-form";

const FAIRNESS = ["round_robin_table", "round_robin_singer", "fifo"] as const;

/** Numeric rule fields in display order; empty means "none" for the nullable ones. */
const NUMBER_FIELDS: readonly { field: RulesField; nullable: boolean }[] = [
  { field: "maxPendingPerUser", nullable: false },
  { field: "maxPendingPerTable", nullable: true },
  { field: "maxSingersPerSong", nullable: false },
  { field: "cooldownMinutesPerUser", nullable: false },
  { field: "duplicateSongWindowMinutes", nullable: false },
  { field: "nightCutoffMinutesBeforeClose", nullable: true },
];
const BOOLEAN_FIELDS: readonly RulesField[] = [
  "requireHostApproval",
  "allowDuets",
  "hostPriorityEnabled",
];

interface SettingsFormProps {
  /** Current values as form strings: `name` plus every rules key. */
  initial: Record<string, string>;
  mode: "live" | "demo";
}

/**
 * Uncontrolled form (see JoinForm for why). After a failed save the action echoes the
 * submission and the inputs remount with it; after a successful save the page revalidates and
 * the fresh `initial` values take over. Browser validation is off so every rule is checked by
 * the engine's `parseRules` on the server and reported in the user's language.
 */
export function SettingsForm({ initial, mode }: SettingsFormProps) {
  const t = useTranslations("admin.settings");
  const [state, formAction, pending] = useActionState(saveSettingsAction, initialSettingsState);
  const values = state.error && state.values ? state.values : initial;
  const formKey = JSON.stringify(values);
  const invalid = (field: RulesField) => state.invalid.includes(field);

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4" noValidate>
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">{t("venue.title")}</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("venue.name")}</span>
          <input
            className="input"
            name="name"
            type="text"
            autoComplete="organization"
            maxLength={VENUE_NAME_MAX}
            defaultValue={values.name ?? ""}
            aria-invalid={state.error === "nameRequired" || undefined}
          />
          {state.error === "nameRequired" && (
            <span className="text-danger text-sm">{t("errors.nameRequired")}</span>
          )}
        </label>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("rules.title")}</h2>
          <p className="text-muted text-sm">{t("rules.hint")}</p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("rules.fairness")}</span>
          <select
            className="input"
            name="fairness"
            defaultValue={values.fairness ?? "round_robin_table"}
            aria-invalid={invalid("fairness") || undefined}
          >
            {FAIRNESS.map((value) => (
              <option key={value} value={value}>
                {t(`rules.fairnessOptions.${value}`)}
              </option>
            ))}
          </select>
          <span className="text-muted text-sm">{t("rules.fairnessHint")}</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          {NUMBER_FIELDS.map(({ field, nullable }) => {
            const min = RULES_MIN[field] ?? 0;
            return (
              <label key={field} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t(`rules.${field}`)}</span>
                <input
                  className="input"
                  name={field}
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={values[field] ?? ""}
                  placeholder={nullable ? t("rules.noLimit") : undefined}
                  aria-invalid={invalid(field) || undefined}
                />
                <span className={`text-sm ${invalid(field) ? "text-danger" : "text-muted"}`}>
                  {invalid(field)
                    ? t(nullable ? "errors.fieldNullable" : "errors.field", { min })
                    : t(`rules.${field}Hint`)}
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          {BOOLEAN_FIELDS.map((field) => (
            <label key={field} className="flex items-start gap-3">
              <input
                type="checkbox"
                name={field}
                className="mt-1 size-5 accent-[var(--color-brand-2)]"
                defaultChecked={values[field] === "on"}
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{t(`rules.${field}`)}</span>
                <span className="text-muted text-sm">{t(`rules.${field}Hint`)}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {state.error && state.error !== "nameRequired" && (
        <p role="alert" className="text-danger text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-accent text-sm">
          {mode === "demo" ? t("savedDemo") : t("saved")}
        </p>
      )}

      <button type="submit" className="btn btn-primary self-start" disabled={pending}>
        {t("save")}
      </button>
    </form>
  );
}
