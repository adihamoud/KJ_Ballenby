import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Catalog import on the demo venue (no Supabase configured, as in CI): the browser parses the
 * file and the Server Actions merge it into this browser context's own in-memory catalog, which
 * starts as the 14 demo songs. With Supabase configured the route needs a signed-in owner, so
 * the suite skips itself.
 */

async function openCatalog(page: Page, locale: "he" | "en") {
  await page.goto(`/${locale}/admin/catalog`);
  test.skip(page.url().includes("/login"), "Supabase configured: admin requires sign-in");
}

function file(name: string, mimeType: string, content: string) {
  return { name, mimeType, buffer: Buffer.from(content, "utf-8") };
}

test.describe("catalog import (demo venue)", () => {
  test("imports a CSV: preview, new and updated songs, history", async ({ page }) => {
    await openCatalog(page, "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Song catalog");
    await expect(page.getByTestId("catalog-counts")).toHaveText("14 active songs");

    const csv = [
      "Song Title,Artist,Language,Length",
      "bohemian rhapsody,QUEEN,,5:54",
      "Mr. Brightside,The Killers,en,3:42",
      "mr. brightside,the killers,,",
      ",Nobody,,",
    ].join("\n");
    await page.getByTestId("catalog-file").setInputFiles(file("songs.csv", "text/csv", csv));

    const preview = page.getByTestId("catalog-preview");
    await expect(preview.getByTestId("catalog-found")).toHaveText("2 songs found");
    await expect(preview).toContainText("1 entry without a title or artist");
    await expect(preview).toContainText("1 duplicate");
    await expect(preview.getByRole("cell", { name: "Mr. Brightside" })).toBeVisible();

    await page.getByTestId("catalog-submit").click();
    const result = page.getByTestId("catalog-result");
    await expect(result.getByTestId("catalog-inserted")).toHaveText("1 new");
    await expect(result.getByTestId("catalog-updated")).toHaveText("1 updated");
    await expect(page.getByTestId("catalog-counts")).toHaveText("15 active songs");

    const row = page.getByTestId("catalog-history-row").first();
    await expect(row).toHaveAttribute("data-status", "done");
    await expect(row).toContainText("songs.csv");
    await expect(row).toContainText("1 new, 1 updated, 0 hidden, 1 skipped");
  });

  test("imports a VirtualDJ playlist in Hebrew and hides songs missing from it", async ({
    page,
  }) => {
    await openCatalog(page, "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("קטלוג שירים");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VirtualFolder>
<song path="D:\\Karaoke\\Queen - Bohemian Rhapsody.mp4" songlength="354.2" artist="Queen" title="Bohemian Rhapsody" idx="0" />
<song path="D:\\Karaoke\\SF001-01 - עומר אדם - שני משוגעים.cdg" songlength="210" idx="1" />
</VirtualFolder>`;
    await page
      .getByTestId("catalog-file")
      .setInputFiles(file("karaoke.vdjfolder", "application/xml", xml));

    const preview = page.getByTestId("catalog-preview");
    await expect(preview).toContainText("פלייליסט של VirtualDJ");
    await expect(preview.getByRole("cell", { name: "שני משוגעים" })).toBeVisible();
    await expect(preview.getByRole("cell", { name: "עומר אדם" })).toBeVisible();

    await page.getByTestId("catalog-deactivate").check();
    await page.getByTestId("catalog-submit").click();
    const result = page.getByTestId("catalog-result");
    await expect(result.getByTestId("catalog-inserted")).toHaveText("1 חדשים");
    await expect(result.getByTestId("catalog-deactivated")).toHaveText("13 הוסתרו");
    await expect(page.getByTestId("catalog-counts")).toHaveText("2 שירים פעילים, 13 מוסתרים");
  });

  test("explains a CSV without a title column", async ({ page }) => {
    await openCatalog(page, "en");
    await page
      .getByTestId("catalog-file")
      .setInputFiles(file("bad.csv", "text/csv", "foo,bar\n1,2\n"));
    await expect(page.getByTestId("catalog-error")).toContainText("couldn't find a title column");
    await expect(page.getByTestId("catalog-preview")).toHaveCount(0);
  });

  test("is reachable from the admin tabs", async ({ page }) => {
    await page.goto("/en/admin");
    test.skip(page.url().includes("/login"), "Supabase configured: admin requires sign-in");
    await page.getByTestId("admin-nav").getByRole("link", { name: "Catalog" }).click();
    await expect(page).toHaveURL(/\/en\/admin\/catalog$/);
  });
});
