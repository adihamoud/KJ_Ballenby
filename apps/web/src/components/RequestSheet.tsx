"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { SearchSongRow } from "@kj/db";
import { CloseIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { useModalDialog } from "@/lib/a11y/useModalDialog";
import { GUEST_NAME_MAX } from "@/lib/guest/join-code";
import { createSongRequest } from "@/lib/guest/request-actions";
import { REQUEST_NOTE_MAX, rejectMessageKey } from "@/lib/guest/request-model";
import type { CreateRequestResponse } from "@/lib/guest/request-model";
import { youtubeThumbnailUrl } from "@/lib/youtube";

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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const thumb = song.videos[0];

  // Focus the first singer, keep Tab inside the sheet, close on Escape, give focus back after.
  useModalDialog(dialogRef, onClose, { initialFocus: firstFieldRef });

  // The page behind the sheet must not scroll with it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

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
      {/* Tapping outside closes; keyboards use Escape or the close button, so not a tab stop. */}
      <button
        type="button"
        tabIndex={-1}
        className="animate-fade-in absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t("guest.request.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="request-sheet"
        className="animate-sheet-in safe-area bg-surface border-border-strong relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-b-0 px-5 pt-3 pb-5 shadow-(--shadow-sheet)"
      >
        <form onSubmit={submit} className="flex flex-col gap-5">
          <span aria-hidden="true" className="bg-border-strong mx-auto h-1.5 w-10 rounded-full" />

          <div className="flex items-center gap-3">
            {thumb ? (
              <Image
                src={youtubeThumbnailUrl(thumb.youtube_id)}
                alt=""
                width={80}
                height={45}
                className="aspect-video w-20 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span
                className="bg-surface-3 aspect-video w-20 shrink-0 rounded-lg"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-brand">{t("guest.request.title")}</p>
              <h2 id={titleId} className="truncate text-lg leading-tight font-black" dir="auto">
                {song.title}
              </h2>
              <p className="text-muted truncate text-sm" dir="auto">
                {song.artist}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="bg-surface-2 text-muted hover:text-text -me-1 flex size-11 shrink-0 items-center justify-center rounded-full"
              aria-label={t("guest.request.close")}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-sm font-semibold">
              {t("guest.request.singers", { max: maxSingers })}
            </legend>
            {singers.map((singer, index) => (
              <div key={index} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="bg-brand-2/20 text-brand-2 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums"
                >
                  {index + 1}
                </span>
                <input
                  ref={index === 0 ? firstFieldRef : undefined}
                  className="input min-h-12"
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
                    className="bg-surface-2 text-muted hover:text-danger flex size-10 shrink-0 items-center justify-center rounded-full"
                    aria-label={t("guest.request.removeSinger", { n: index + 1 })}
                    onClick={() => setSingers((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <MinusIcon size={18} />
                  </button>
                )}
              </div>
            ))}
            {canAddSinger && (
              <button
                type="button"
                className="btn btn-secondary btn-sm self-start"
                onClick={() => setSingers((prev) => [...prev, ""])}
              >
                <PlusIcon size={16} />
                {t("guest.request.addSinger")}
              </button>
            )}
            <p className="text-faint text-xs">{t("privacy.links.request")}</p>
          </fieldset>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{t("guest.request.note")}</span>
            <textarea
              className="input min-h-20 resize-none py-3"
              maxLength={REQUEST_NOTE_MAX}
              placeholder={t("guest.request.notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && (
            <p
              role="alert"
              className="bg-danger/10 text-danger border-danger/30 rounded-xl border px-3 py-2.5 text-sm font-medium"
              data-testid="request-error"
            >
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary text-base" disabled={pending}>
            {pending ? t("guest.request.sending") : t("guest.request.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
