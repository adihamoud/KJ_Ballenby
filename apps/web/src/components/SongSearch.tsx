"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { SearchSongRow } from "@kj/db";
import { useOptionalGuestNight } from "@/components/GuestNightContext";
import { searchSongsAction } from "@/lib/guest/song-actions";
import { RequestSheet } from "./RequestSheet";
import { SONG_LANGUAGES, type SongLanguage } from "@/lib/guest/song-query";
import { formatDuration, youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/youtube";

const DEBOUNCE_MS = 250;

export interface SongSearchProps {
  initialSongs: SearchSongRow[];
  /** True when the server-side catalog load failed (shows the unavailable message). */
  initialError?: boolean;
  /** Request options; omit to browse only (no open night, not joined). */
  request?: {
    guestName: string;
    maxSingers: number;
  };
}

export function SongSearch({ initialSongs, initialError = false, request }: SongSearchProps) {
  const t = useTranslations("guest.search");
  const night = useOptionalGuestNight();
  const [query, setQuery] = useState("");
  const [requesting, setRequesting] = useState<SearchSongRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [language, setLanguage] = useState<SongLanguage | null>(null);
  const [songs, setSongs] = useState<SearchSongRow[]>(initialSongs);
  const [error, setError] = useState<string | null>(initialError ? t("errors.unavailable") : null);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    // The server already rendered the initial list; only re-query after the guest acts.
    if (first.current) {
      first.current = false;
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        const res = await searchSongsAction(query, language);
        setSongs(res.songs);
        setError(res.error ? t(`errors.${res.error}`) : null);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, language, t]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(handle);
  }, [toast]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="song-search-title">
      <h2 id="song-search-title" className="text-lg font-semibold">
        {t("title")}
      </h2>

      {toast && (
        <p role="status" className="bg-brand-2/20 text-text rounded-xl px-3 py-2 text-sm">
          {toast}
        </p>
      )}

      <input
        className="input"
        type="search"
        inputMode="search"
        autoComplete="off"
        enterKeyHint="search"
        aria-label={t("title")}
        placeholder={t("placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="flex gap-2" role="group" aria-label={t("languageFilter")}>
        <FilterChip active={language === null} onClick={() => setLanguage(null)}>
          {t("all")}
        </FilterChip>
        {SONG_LANGUAGES.map((lang) => (
          <FilterChip key={lang} active={language === lang} onClick={() => setLanguage(lang)}>
            {t(`lang.${lang}`)}
          </FilterChip>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      <ul
        className={`flex flex-col gap-3 transition-opacity ${pending ? "opacity-60" : ""}`}
        aria-busy={pending}
      >
        {songs.map((song) => (
          <SongCard
            key={song.id}
            song={song}
            onRequest={request ? () => setRequesting(song) : undefined}
          />
        ))}
      </ul>

      {!error && songs.length === 0 && (
        <p className="text-muted text-sm">{t("noResults", { query })}</p>
      )}

      {request && requesting && (
        <RequestSheet
          song={requesting}
          guestName={request.guestName}
          maxSingers={request.maxSingers}
          onClose={() => setRequesting(null)}
          onRequested={(res) => {
            setRequesting(null);
            setToast(t("requested", { title: requesting.title }));
            // The response already carries the guest's fresh view: hand it to the queue card.
            night?.setView(res.view);
          }}
        />
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-brand-2 bg-brand-2/20 text-text" : "border-border bg-surface-2 text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function SongCard({ song, onRequest }: { song: SearchSongRow; onRequest?: () => void }) {
  const t = useTranslations("guest.search");
  const primary = song.videos[0];
  const duration = formatDuration(primary?.duration_sec ?? song.duration_sec);

  return (
    <li className="card flex gap-3 p-3" data-testid="song-card">
      {primary ? (
        <a
          href={youtubeWatchUrl(primary.youtube_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
          aria-label={t("openOnYoutube", { title: song.title })}
        >
          <Image
            src={youtubeThumbnailUrl(primary.youtube_id)}
            alt=""
            width={120}
            height={68}
            className="aspect-video w-[120px] rounded-lg object-cover"
          />
        </a>
      ) : (
        <div
          className="bg-surface-2 aspect-video w-[120px] shrink-0 rounded-lg"
          aria-hidden="true"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-semibold" dir="auto">
          {song.title}
        </p>
        <p className="text-muted truncate text-sm" dir="auto">
          {song.artist}
          {duration && <span className="ms-2 tabular-nums">{duration}</span>}
        </p>

        {song.videos.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={t("versions")}>
            {song.videos.map((v, i) => (
              <li key={v.youtube_id}>
                <a
                  href={youtubeWatchUrl(v.youtube_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-surface-2 border-border text-text inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                >
                  <YoutubeIcon />
                  <span dir="auto">{v.label ?? t("versionN", { n: i + 1 })}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {onRequest && (
          <button
            type="button"
            onClick={onRequest}
            className="btn btn-primary mt-2 min-h-10 self-start px-4 text-sm"
            aria-label={t("requestSong", { title: song.title })}
          >
            {t("request")}
          </button>
        )}
      </div>
    </li>
  );
}

function YoutubeIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
    </svg>
  );
}
