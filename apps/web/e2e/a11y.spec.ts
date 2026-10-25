import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { A11Y_STORAGE_KEY } from "../src/lib/a11y/preferences";
import { A11Y_SCANS, DEMO_TABLE_CODE } from "../src/lib/a11y/routes";
import type { A11yScan } from "../src/lib/a11y/routes";

/**
 * axe-core on every page in both locales, against WCAG 2.2 A/AA plus axe best practices
 * (docs/ACCESSIBILITY.md). Runs in demo mode like the rest of the suite. The page list lives in
 * src/lib/a11y/routes.ts; a unit test fails when a page is missing from it.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa", "best-practice"];

async function joinAsGuest(page: Page, locale: string) {
  await page.goto(`/${locale}/join`);
  await page.locator("input[name='code']:not([type='hidden'])").fill(DEMO_TABLE_CODE);
  await page.locator("input[name='name']").fill("Dana");
  await page.locator("form button[type='submit']").click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/guest$`));
}

async function prepare(page: Page, locale: string, scan: A11yScan) {
  if (scan.prefs) {
    await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
      A11Y_STORAGE_KEY,
      JSON.stringify(scan.prefs),
    ] as const);
  }
  if (scan.as === "guest") await joinAsGuest(page, locale);
  await page.goto(`/${locale}${scan.path}`);
  if (scan.open === "requestSheet") {
    await page.getByTestId("song-card").first().getByRole("button").last().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  if (scan.open === "a11yMenu") {
    await page.getByTestId("a11y-menu-button").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  // Let entrance animations finish so colour contrast is measured on the final frame. Looping
  // ones (live dot, skeleton) never finish and only move shadows and gradients.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
}

function report(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n  ${v.helpUrl}\n` +
        v.nodes.map((n) => `  - ${n.target.join(" ")}\n    ${n.failureSummary}`).join("\n"),
    )
    .join("\n\n");
}

for (const locale of ["he", "en"] as const) {
  test.describe(`axe ${locale}`, () => {
    for (const scan of A11Y_SCANS) {
      test(`${scan.name} has no WCAG 2.2 AA violations`, async ({ page }, testInfo) => {
        await prepare(page, locale, scan);
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        if (violations.length > 0) {
          // Full axe output (every node, every check) in the HTML report and CI artifact.
          await testInfo.attach("axe-violations.json", {
            body: JSON.stringify(violations, null, 2),
            contentType: "application/json",
          });
        }
        expect(violations, report(violations)).toEqual([]);
      });
    }
  });
}
