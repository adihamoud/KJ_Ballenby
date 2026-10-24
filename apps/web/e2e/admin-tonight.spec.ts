import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * "Tables tonight" on the demo night (no Supabase configured, as in CI). With Supabase
 * configured the route needs a signed-in owner, so the suite skips itself.
 */

async function openBoard(page: Page, path: string) {
  await page.goto(path);
  test.skip(page.url().includes("/login"), "Supabase configured: admin requires sign-in");
}

const card = (page: Page, label: string) =>
  page.locator(`[data-testid=table-card][data-table-label="${label}"]`);

test.describe("tables tonight (demo night)", () => {
  test("shows one card per table with guests, songs and opening time", async ({ page }) => {
    await openBoard(page, "/en/admin/tonight");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tables tonight");
    await expect(
      page.getByTestId("admin-nav").getByRole("link", { name: "Tables tonight" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("table-card")).toHaveCount(4);
    await expect(page.getByTestId("tables-summary")).toContainText("4 open tables");

    const t2 = card(page, "T2");
    await expect(t2.getByTestId("table-now-singing")).toContainText("Sweet Caroline");
    await expect(t2.getByTestId("table-opened")).toContainText("Open since");

    const t1 = card(page, "T1");
    await expect(t1.getByTestId("table-guests")).toContainText("דנה");
    await expect(t1.getByTestId("table-sung")).toContainText("Bohemian Rhapsody");

    const t3 = card(page, "T3");
    await expect(t3.getByTestId("table-waiting")).toContainText("Awaiting approval");
  });

  test("renders in Hebrew, right-to-left", async ({ page }) => {
    await openBoard(page, "/he/admin/tonight");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("שולחנות הערב");
    await expect(page.getByTestId("table-card")).toHaveCount(4);
  });
});
