/**
 * Build identity shown in the footer of every page, so a screenshot or bug report says exactly
 * which release (and commit) it came from. Values are inlined by next.config.ts at build time.
 */
export type BuildInfo = {
  version: string;
  commit: string;
  channel: string;
};

export function buildInfo(): BuildInfo {
  return {
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "",
    commit: process.env.NEXT_PUBLIC_APP_COMMIT ?? "",
    channel: process.env.NEXT_PUBLIC_APP_CHANNEL ?? "",
  };
}

/** `0.2.0 · a1b2c3d · preview`, skipping whatever is unknown. Empty when nothing is known. */
export function versionLabel({ version, commit, channel }: BuildInfo): string {
  return [version, commit, channel].filter(Boolean).join(" · ");
}
