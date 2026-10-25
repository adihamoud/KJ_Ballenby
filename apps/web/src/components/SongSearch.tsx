"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { SearchSongRow } from "@kj/db";
import { useOptionalGuestNight } from "@/components/GuestNightContext";
import { CheckIcon, CloseIcon, PlayIcon, SearchIcon, YoutubeIcon } from "@/components/icons";
import { searchSongsAction } from "@/lib/guest/song-actions";
import { RequestSheet } from "./RequestSheet";
import { SONG_LANGUAGES, type SongLanguage } from "@/lib/guest/song-query";
import { formatDuration, youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/youtube";

const DEBOUNCE_MS = 250;
const TOAST_MS = 4000;

export interface SongSearchProps {
  initialSongs: SearchSongRow[];
  /** True when the server-side catalog load failed (shows the unavailable message). */
  initialError?: boolean;
  /** Request options; omit to browse only (no open night, not joined). */
  request?: {
    guestName: string;
    maxSingers: number;
  };
  /** Joined but the night is not open: say so instead of showing nothing to tap. */
  browseOnly?: boolean;
}

export function SongSearch({
  initialSongs,
  initialError = false,
  request,
  browseOnly = false,
}: SongSearchProps) {
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
  const searchRef = useRef<HTMLInputElement | null>(null);

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
    const handle = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="song-search-title">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 id="song-search-title" className="text-lg font-bold">
          {t("title")}
        </h2>
        {!error && (
          <span className="text-muted text-sm tabular-nums">
            {t("results", { count: songs.length })}
          </span>
        )}
      </div>

      <div className="relative">
        <SearchIcon
          size={20}
          className="text-faint pointer-events-none absolute start-4 top-1/2 -translate-y-1/2"
        />
        <input
          ref={searchRef}
          className="input ps-12 pe-12"
          type="search"
          inputMode="search"
          autoComplete="off"
          enterKeyHint="search"
          aria-label={t("title")}
          placeholder={t("placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="text-muted hover:text-text absolute end-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full"
            aria-label={t("clear")}
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <CloseIcon size={18} />
          </button>
        )}
      </div>

      <div
        className="-mx-4 flex scrollbar-none gap-2 overflow-x-auto px-4"
        role="group"
        aria-label={t("languageFilter")}
      >
        <FilterChip active={language === null} onClick={() => setLanguage(null)}>
          {t("all")}
        </FilterChip>
        {SONG_LANGUAGES.map((lang) => (
          <FilterChip key={lang} active={language === lang} onClick={() => setLanguage(lang)}>
            {t(`lang.${lang}`)}
          </FilterChip>
        ))}
      </div>

      {browseOnly && !request && <p className="text-muted px-1 text-sm">{t("browseOnly")}</p>}

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      <ul
        className={`flex flex-col gap-2.5 transition-opacity ${pending ? "opacity-60" : ""}`}
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
        <p className="card text-muted p-5 text-center text-sm">
          {query ? t("noResults", { query }) : t("noSongs")}
        </p>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <p
            role="status"
            className="animate-toast-in bg-text text-bg flex max-w-md items-center gap-2.5 rounded-full px-4 py-3 text-sm font-semibold shadow-xl"
          >
            <span className="bg-success text-bg flex size-5 shrink-0 items-center justify-center rounded-full">
              <CheckIcon size={12} strokeWidth={3} />
            </span>
            <span className="truncate" dir="auto">
              {toast}
            </span>
          </p>
        </div>
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
      className={`chip shrink-0 ${active ? "chip-active" : "hover:text-text"}`}
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
          className="group relative shrink-0 self-start overflow-hidden rounded-xl"
          aria-label={t("openOnYoutube", { title: song.title })}
        >
          <Image
            src={youtubeThumbnailUrl(primary.youtube_id)}
            alt=""
            width={112}
            height={63}
            className="aspect-video w-28 object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-80 transition-opacity group-hover:opacity-100">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/90 text-black">
              <PlayIcon size={14} />
            </span>
          </span>
        </a>
      ) : (
        <div
          className="bg-surface-3 text-faint flex aspect-video w-28 shrink-0 items-center justify-center self-start rounded-xl"
          aria-hidden="true"
        >
          <PlayIcon size={18} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate leading-tight font-bold" dir="auto">
          {song.title}
        </p>
        <p className="text-muted truncate text-sm" dir="auto">
          {song.artist}
          {duration && <span className="text-faint ms-2 tabular-nums">{duration}</span>}
        </p>

        {song.videos.length > 1 && (
          <ul className="mt-0.5 flex flex-wrap gap-1.5" aria-label={t("versions")}>
            {song.videos.map((v, i) => (
              <li key={v.youtube_id}>
                <a
                  href={youtubeWatchUrl(v.youtube_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-surface-3 text-muted hover:text-text inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] font-semibold"
                >
                  <YoutubeIcon size={11} />
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
            className="btn btn-primary btn-sm mt-1.5 self-start"
            aria-label={t("requestSong", { title: song.title })}
          >
            {t("request")}
          </button>
        )}
      </div>
    </li>
  );
}
