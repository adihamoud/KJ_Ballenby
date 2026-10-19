"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/** Copy / native-share an invite URL. */
export function ShareLink({ url, title }: { url: string; title: string }) {
  const t = useTranslations("app.share");
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (http, permissions); the URL is visible to copy by hand.
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      // User dismissed the sheet.
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        className="input font-mono text-xs"
        dir="ltr"
        readOnly
        value={url}
        onFocus={(e) => e.target.select()}
      />
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary flex-1" onClick={copy}>
          {copied ? t("copied") : t("copy")}
        </button>
        {canShare && (
          <button type="button" className="btn btn-primary flex-1" onClick={share}>
            {t("share")}
          </button>
        )}
      </div>
    </div>
  );
}
