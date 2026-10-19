"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { closeNight, openNight } from "./actions";

export function NightControl({ venueId, nightId }: { venueId: string; nightId: string | null }) {
  const t = useTranslations("dj.night");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ ok: boolean }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(t("error"));
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {nightId ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("closeConfirm"))) run(() => closeNight(nightId));
          }}
        >
          {t("closeButton")}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => openNight(venueId))}
        >
          {t("openButton")}
        </button>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
