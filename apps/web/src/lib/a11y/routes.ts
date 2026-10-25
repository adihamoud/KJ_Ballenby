import type { A11yPreferences } from "./preferences";

/**
 * Every page the accessibility scan visits (`e2e/a11y.spec.ts`), in both locales. A unit test
 * (`routes.test.ts`) walks `src/app/[locale]` and fails when a `page.tsx` has no entry here, so a
 * new route cannot ship without an axe scan. See docs/ACCESSIBILITY.md.
 *
 * `route` is the App Router pattern with route groups removed (`(guest)/j/[token]` -> `/j/[token]`).
 * `path` is what the browser opens, after the locale (`/en` + path). `as` picks a demo-mode
 * starting state the scan sets up first.
 */
export type A11yScan = {
  /** Unique, readable name for the test title and the report. */
  name: string;
  route: string;
  path: string;
  as?: "guest";
  /** Interaction to run before scanning, for states that only appear after a click. */
  open?: "requestSheet" | "a11yMenu";
  /** Accessibility-menu settings stored before the page loads. */
  prefs?: Partial<A11yPreferences>;
};

/** A table that exists in demo mode (no Supabase), from `src/lib/demo/venue.ts`. */
export const DEMO_TABLE_CODE = "DEMO1";
const DEMO_QR_TOKEN = "00000000-0000-4000-8000-00000000d002";

export const A11Y_SCANS: readonly A11yScan[] = [
  { name: "landing", route: "/", path: "" },
  { name: "login", route: "/login", path: "/login" },
  { name: "password reset", route: "/login/reset", path: "/login/reset" },
  { name: "sign up", route: "/signup", path: "/signup" },
  { name: "join by code", route: "/join", path: "/join" },
  { name: "join by QR", route: "/j/[token]", path: `/j/${DEMO_QR_TOKEN}` },
  { name: "join by dead QR", route: "/j/[token]", path: "/j/not-a-real-token" },
  { name: "guest home", route: "/guest", path: "/guest", as: "guest" },
  {
    name: "guest request sheet",
    route: "/guest",
    path: "/guest",
    as: "guest",
    open: "requestSheet",
  },
  // Redirects anonymous users to /login; the scan covers wherever it lands.
  { name: "signed-in home", route: "/app", path: "/app" },
  { name: "DJ console", route: "/dj", path: "/dj" },
  { name: "admin overview", route: "/admin", path: "/admin" },
  { name: "admin tables", route: "/admin/tables", path: "/admin/tables" },
  { name: "admin tonight", route: "/admin/tonight", path: "/admin/tonight" },
  { name: "admin DJ console", route: "/admin/dj", path: "/admin/dj" },
  { name: "admin queue (redirect)", route: "/admin/queue", path: "/admin/queue" },
  { name: "admin catalog", route: "/admin/catalog", path: "/admin/catalog" },
  { name: "admin QR sheet", route: "/admin/qr", path: "/admin/qr" },
  { name: "admin settings", route: "/admin/settings", path: "/admin/settings" },
  { name: "accessibility statement", route: "/accessibility", path: "/accessibility" },
  { name: "accessibility menu", route: "/", path: "", open: "a11yMenu" },
  {
    name: "landing, high contrast and larger text",
    route: "/",
    path: "",
    prefs: { textSize: "larger", highContrast: true, underlineLinks: true },
  },
  {
    name: "guest home, high contrast and larger text",
    route: "/guest",
    path: "/guest",
    as: "guest",
    prefs: { textSize: "larger", highContrast: true },
  },
  { name: "not found", route: "/[...rest]", path: "/this-page-does-not-exist" },
];

/** Turn a `page.tsx` path below `src/app/[locale]` into its route pattern. */
export function routeFromPageFile(relativeFile: string): string {
  const segments = relativeFile
    .replaceAll("\\", "/")
    .split("/")
    .slice(0, -1)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  return "/" + segments.join("/");
}
