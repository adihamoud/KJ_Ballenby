import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
// Bumped by release-please together with the root package.json (release-please-config.json).
import { version } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Short commit of this build: Vercel and GitHub Actions expose it, a local build asks git. */
function buildCommit(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

/** Where this build runs, shown next to the version. Production and local prod builds show none. */
function buildChannel(): string {
  if (process.env.VERCEL_ENV === "preview") return "preview";
  if (process.env.NODE_ENV === "development") return "dev";
  return "";
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Inlined at build time; read by src/lib/version.ts for the footer on every page.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: buildCommit(),
    NEXT_PUBLIC_APP_CHANNEL: buildChannel(),
  },
  // Lets a production build (e.g. the Playwright run) live next to a running dev server instead
  // of racing it for `.next`. Unset in CI and normal use.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  transpilePackages: ["@kj/i18n", "@kj/db", "@kj/queue-engine"],
  images: {
    // Song thumbnails come straight from YouTube's image CDN (derived from the video id).
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
};

export default withNextIntl(nextConfig);
