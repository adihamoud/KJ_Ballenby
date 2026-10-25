import { notFound } from "next/navigation";

/**
 * Unknown paths under a locale render the localized `[locale]/not-found.tsx` inside the locale
 * layout. Without this catch-all Next falls back to its bare default 404, which has no
 * `<html lang>`, no `dir` and no landmarks (axe: html-has-lang, landmark-one-main).
 */
export default function CatchAll() {
  notFound();
}
