import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { A11Y_SCANS, routeFromPageFile } from "./routes";

const APP_DIR = fileURLToPath(new URL("../../app/[locale]", import.meta.url));

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(full);
    return entry.name === "page.tsx" ? [relative(APP_DIR, full)] : [];
  });
}

describe("accessibility scan coverage", () => {
  it("maps page files to route patterns", () => {
    expect(routeFromPageFile("page.tsx")).toBe("/");
    expect(routeFromPageFile("(guest)/j/[token]/page.tsx")).toBe("/j/[token]");
    expect(routeFromPageFile("(admin)\\admin\\qr\\page.tsx")).toBe("/admin/qr");
  });

  it("scans every page in src/app/[locale]", () => {
    const scanned = new Set(A11Y_SCANS.map((scan) => scan.route));
    const missing = pageFiles(APP_DIR)
      .map(routeFromPageFile)
      .filter((route) => !scanned.has(route));
    // A new page needs an entry in src/lib/a11y/routes.ts so e2e/a11y.spec.ts runs axe on it.
    expect(missing).toEqual([]);
  });

  it("has no scan for a route that no longer exists", () => {
    const routes = new Set(pageFiles(APP_DIR).map(routeFromPageFile));
    const stale = A11Y_SCANS.filter((scan) => !routes.has(scan.route)).map((scan) => scan.name);
    expect(stale).toEqual([]);
  });

  it("gives every scan a unique name", () => {
    const names = A11Y_SCANS.map((scan) => scan.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
