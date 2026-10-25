"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AccessibilityIcon, CloseIcon } from "@/components/icons";
import { useModalDialog } from "@/lib/a11y/useModalDialog";
import {
  A11Y_STORAGE_KEY,
  DEFAULT_PREFERENCES,
  PREFERENCE_ATTRIBUTE_NAMES,
  TEXT_SIZES,
  parsePreferences,
  preferenceAttributes,
} from "@/lib/a11y/preferences";
import type { A11yPreferences } from "@/lib/a11y/preferences";

function readStored(): A11yPreferences {
  try {
    return parsePreferences(window.localStorage.getItem(A11Y_STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function apply(prefs: A11yPreferences) {
  const root = document.documentElement;
  for (const name of PREFERENCE_ATTRIBUTE_NAMES) root.removeAttribute(name);
  for (const [name, value] of Object.entries(preferenceAttributes(prefs))) {
    root.setAttribute(name, value);
  }
  try {
    if (Object.keys(preferenceAttributes(prefs)).length === 0) {
      window.localStorage.removeItem(A11Y_STORAGE_KEY);
    } else {
      window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    // Private mode or storage blocked: the settings still apply until the page is left.
  }
}

/**
 * Footer button that opens the accessibility settings: text size, high contrast, no motion and
 * underlined links (docs/ACCESSIBILITY.md). Changes apply at once and are kept in this browser
 * only. Built into the app on purpose: no third-party overlay (ADR-013).
 */
export function AccessibilityMenu() {
  const t = useTranslations("a11y.menu");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost btn-sm text-muted"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        data-testid="a11y-menu-button"
      >
        <AccessibilityIcon size={18} />
        {t("open")}
      </button>
      {open && <AccessibilitySheet onClose={close} opener={buttonRef} />}
    </>
  );
}

function AccessibilitySheet({
  onClose,
  opener,
}: {
  onClose: () => void;
  opener: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("a11y.menu");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [prefs, setPrefs] = useState<A11yPreferences>(DEFAULT_PREFERENCES);

  useModalDialog(dialogRef, onClose, { returnFocus: opener });

  useEffect(() => {
    setPrefs(readStored());
  }, []);

  const update = (next: Partial<A11yPreferences>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    apply(merged);
  };

  const toggles = [
    { key: "highContrast", label: t("highContrast"), hint: t("highContrastHint") },
    { key: "reduceMotion", label: t("reduceMotion"), hint: t("reduceMotionHint") },
    { key: "underlineLinks", label: t("underlineLinks"), hint: t("underlineLinksHint") },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Tapping outside closes; keyboards use Escape or the close button, so not a tab stop. */}
      <button
        type="button"
        tabIndex={-1}
        className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t("close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="a11y-menu"
        className="animate-sheet-in safe-area bg-surface border-border-strong relative flex max-h-[92dvh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-t-3xl border px-5 pt-5 pb-6 text-start shadow-(--shadow-sheet) sm:rounded-3xl"
      >
        <div className="flex items-center gap-3">
          <span className="bg-surface-3 text-brand-2 flex size-11 shrink-0 items-center justify-center rounded-2xl">
            <AccessibilityIcon size={22} />
          </span>
          <h2 id={titleId} className="flex-1 text-lg font-black">
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-2 text-muted hover:text-text -me-1 flex size-11 shrink-0 items-center justify-center rounded-full"
            aria-label={t("close")}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t("textSize")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {TEXT_SIZES.map((size, index) => (
              <label
                key={size}
                className={`chip has-focus-visible:outline-brand-2 min-h-11 cursor-pointer justify-center has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-solid ${
                  prefs.textSize === size ? "chip-active" : ""
                }`}
              >
                <input
                  type="radio"
                  name="a11y-text-size"
                  value={size}
                  checked={prefs.textSize === size}
                  onChange={() => update({ textSize: size })}
                  className="sr-only"
                />
                <span aria-hidden="true" style={{ fontSize: `${0.875 + index * 0.125}rem` }}>
                  {t("sampleLetter")}
                </span>
                {t(`textSizes.${size}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-3">
          {toggles.map(({ key, label, hint }) => (
            <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => update({ [key]: e.currentTarget.checked })}
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand-2)]"
                data-testid={`a11y-${key}`}
              />
              <span className="flex flex-col">
                <span className="font-semibold">{label}</span>
                <span className="text-muted text-sm">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-muted text-sm">{t("deviceNote")}</p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => update(DEFAULT_PREFERENCES)}
          >
            {t("reset")}
          </button>
          <Link href="/accessibility" className="text-brand-2 text-sm font-semibold underline">
            {t("statement")}
          </Link>
        </div>
      </div>
    </div>
  );
}
