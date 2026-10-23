"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { SearchSongRow } from "@kj/db";
import { GUEST_NAME_MAX } from "@/lib/guest/join-code";
import { createSongRequest } from "@/lib/guest/request-actions";
import { REQUEST_NOTE_MAX, rejectMessageKey } from "@/lib/guest/request-model";
import type { CreateRequestResponse } from "@/lib/guest/request-model";

export interface RequestSheetProps {
  song: SearchSongRow;
  /** Prefilled first singer. */
  guestName: string;
  maxSingers: number;
  onClose: () => void;
  /** Called after the server accepted the request. */
  onRequested: (res: Extract<CreateRequestResponse, { ok: true }>) => void;
}

/**
 * Bottom sheet that turns a catalog card into a song request: singers (the guest first, more
 * up to the venue's limit) and an optional note. Rejections from the engine are shown inline
 * with the localized `queue.reject.*` message for the reason code.
 */
export function RequestSheet({
  song,
  guestName,
  maxSingers,
  onClose,
  onRequested,
}: RequestSheetProps) {
  const t = useTranslations();
  const titleId = useId();
  const [singers, setSingers] = useState<string[]>([guestName]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canAddSinger = singers.length < maxSingers;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createSongRequest({ songId: song.id, singers, note });
      if (res.ok) {
        onRequested(res);
        return;
      }
      setError(
        res.kind === "rejected"
          ? t(rejectMessageKey(res.reason))
          : t(`guest.request.errors.${res.error}`),
      );
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={t("guest.request.close")}
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="request-sheet"
        onSubmit={submit}
        className="card safe-area relative flex w-full max-w-md flex-col gap-4 rounded-b-none p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-brand text-sm font-semibold tracking-wide uppercase">
              {t("guest.request.title")}
            </p>
            <h2 id={titleId} className="truncate text-xl font-bold" dir="auto">
              {song.title}
            </h2>
            <p className="text-muted truncate text-sm" dir="auto">
              {song.artist}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted -me-2 p-2 text-xl leading-none"
            aria-label={t("guest.request.close")}
          >
            ×
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            {t("guest.request.singers", { max: maxSingers })}
          </legend>
          {singers.map((singer, index) => (
            <div key={index} className="flex gap-2">
              <input
                ref={index === 0 ? firstFieldRef : undefined}
                className="input"
                type="text"
                autoComplete="off"
                maxLength={GUEST_NAME_MAX}
                aria-label={t("guest.request.singerN", { n: index + 1 })}
                placeholder={t("guest.request.singerPlaceholder")}
                value={singer}
                onChange={(e) =>
                  setSingers((prev) => prev.map((s, i) => (i === index ? e.target.value : s)))
                }
                required={index === 0}
              />
              {singers.length > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 px-3"
                  aria-label={t("guest.request.removeSinger", { n: index + 1 })}
                  onClick={() => setSingers((prev) => prev.filter((_, i) => i !== index))}
                >
                  −
                </button>
              )}
            </div>
          ))}
          {canAddSinger && (
            <button
              type="button"
              className="text-brand-2 self-start py-1 text-sm font-semibold"
              onClick={() => setSingers((prev) => [...prev, ""])}
            >
              {t("guest.request.addSinger")}
            </button>
          )}
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("guest.request.note")}</span>
          <textarea
            className="input min-h-20 resize-none"
            maxLength={REQUEST_NOTE_MAX}
            placeholder={t("guest.request.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {error && (
          <p role="alert" className="text-danger text-sm" data-testid="request-error">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? t("common.loading") : t("guest.request.submit")}
        </button>
      </form>
    </div>
  );
}
