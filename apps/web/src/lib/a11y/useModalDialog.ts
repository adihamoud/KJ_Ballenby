"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[inert]") && el.getClientRects().length > 0,
  );
}

/**
 * Keyboard behaviour of a modal dialog (WAI-ARIA APG "Dialog (Modal)"), for the element with
 * `role="dialog" aria-modal="true"` that `ref` points at:
 *
 * - focus moves into the dialog when it opens (`initialFocus`, else its first focusable),
 * - Tab and Shift+Tab wrap inside it instead of reaching the page behind,
 * - Escape calls `onClose`,
 * - focus returns to whatever had it before (the button that opened the dialog) on close, or to
 *   `returnFocus` when given. Safari does not focus a button on click or tap, so a dialog opened
 *   by a tap should pass its opener here.
 *
 * Mount the dialog only while it is open; the hook runs on mount and cleans up on unmount.
 */
export function useModalDialog(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  {
    initialFocus,
    returnFocus,
  }: {
    initialFocus?: RefObject<HTMLElement | null>;
    returnFocus?: RefObject<HTMLElement | null>;
  } = {},
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener =
      returnFocus?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    (initialFocus?.current ?? focusables(dialog)[0] ?? dialog).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(dialog);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
    // Runs once per mount: the dialog's lifetime is its mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
