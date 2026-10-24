import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Venue admin on the demo venue (no Supabase configured, as in CI). Each browser context edits
 * its own in-memory sandbox, so tests may add and change tables freely. With Supabase
 * configured the routes need a signed-in owner, so the suite skips itself.
 */

const CODE_RE = /^[A-Z2-9]{5}$/;

async function openAdmin(page: Page, path: string) {
  await page.goto(path);
  test.skip(page.url().includes("/login"), "Supabase configured: admin requires sign-in");
}

function uniqueLabel(prefix: string) {
  return `${prefix} ${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("venue admin (demo venue)", () => {
  test("overview renders in Hebrew, right-to-left, with the section tabs", async ({ page }) => {
    await openAdmin(page, "/he/admin");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("סקירה");
    await expect(page.getByTestId("admin-venue-name")).toContainText("Demo Karaoke Bar");
    const nav = page.getByTestId("admin-nav");
    await expect(nav.getByRole("link", { name: "שולחנות" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "דף QR" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "הגדרות" })).toBeVisible();
  });

  test("overview renders in English and links into the sections", async ({ page }) => {
    await openAdmin(page, "/en/admin");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Overview");
    await expect(page.getByText(/4 tables, 4 active/)).toBeVisible();
    await page.getByRole("link", { name: "Manage tables" }).click();
    await expect(page).toHaveURL(/\/en\/admin\/tables$/);
  });
});

test.describe("tables (demo venue)", () => {
  test("lists the seeded tables with their codes, in Hebrew too", async ({ page }) => {
    await openAdmin(page, "/he/admin/tables");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("שולחנות");
    const rows = page.getByTestId("table-row");
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: "T1" }).getByTestId("table-code")).toHaveText("DEMO1");
    await expect(rows.first().getByTestId("table-status")).toHaveText("פעיל");
  });

  test("adds a table with a fresh code, renames it, swaps its code and deactivates it", async ({
    page,
  }) => {
    await openAdmin(page, "/en/admin/tables");
    const label = uniqueLabel("Patio");
    await page.getByLabel("Table label").fill(label);
    await page.getByRole("button", { name: "Add table" }).click();

    const row = page
      .getByTestId("table-row")
      .filter({ has: page.getByText(label, { exact: true }) });
    await expect(row).toHaveCount(1);
    const firstCode = (await row.getByTestId("table-code").textContent()) ?? "";
    expect(firstCode).toMatch(CODE_RE);
    await expect(page.getByTestId("table-row")).toHaveCount(5);
    await expect(page.getByLabel("Table label")).toHaveValue("");

    // Rename.
    const renamed = `${label} B`;
    await row.getByRole("button", { name: "Rename" }).click();
    await row.getByLabel("New label").fill(renamed);
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("table-label").filter({ hasText: renamed })).toBeVisible();
    const renamedRow = page
      .getByTestId("table-row")
      .filter({ has: page.getByText(renamed, { exact: true }) });

    // Regenerate the join code (confirm dialog).
    page.once("dialog", (dialog) => dialog.accept());
    await renamedRow.getByRole("button", { name: "New code" }).click();
    await expect
      .poll(async () => renamedRow.getByTestId("table-code").textContent())
      .not.toBe(firstCode);
    expect(await renamedRow.getByTestId("table-code").textContent()).toMatch(CODE_RE);

    // Deactivate, then it disappears from the QR sheet.
    await renamedRow.getByRole("button", { name: "Deactivate" }).click();
    await expect(renamedRow.getByTestId("table-status")).toHaveText("Inactive");
    await expect(renamedRow.getByRole("button", { name: "Activate" })).toBeVisible();

    await page.goto("/en/admin/qr");
    await expect(page.getByTestId("qr-card")).toHaveCount(4);
    await expect(page.getByTestId("qr-card").filter({ hasText: renamed })).toHaveCount(0);

    // The sandbox survives a reload.
    await page.goto("/en/admin/tables");
    await expect(page.getByTestId("table-row")).toHaveCount(5);
  });

  test("rejects an empty label and a duplicate label inline", async ({ page }) => {
    await openAdmin(page, "/en/admin/tables");
    await page.getByLabel("Table label").fill("   ");
    await page.getByRole("button", { name: "Add table" }).click();
    await expect(page.getByText(/enter a label/i)).toBeVisible();

    await page.getByLabel("Table label").fill("t1");
    await page.getByRole("button", { name: "Add table" }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();
    await expect(page.getByLabel("Table label")).toHaveValue("t1");
    await expect(page.getByTestId("table-row")).toHaveCount(4);
  });
});

test.describe("QR sheet (demo venue)", () => {
  test("prints one card per active table with a QR link and the typed code", async ({ page }) => {
    await openAdmin(page, "/en/admin/qr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("QR sheet");
    const cards = page.getByTestId("qr-card");
    await expect(cards).toHaveCount(4);

    const t2 = cards.filter({ hasText: "T2" });
    await expect(t2.locator("svg path")).toHaveAttribute("d", /^M\d+ \d+h\d+v1h-\d+z/);
    await expect(t2.getByTestId("qr-code-text")).toHaveText("DEMO2");
    await expect(t2.getByRole("link", { name: /scan to join t2/i })).toHaveAttribute(
      "href",
      /\/en\/j\/00000000-0000-4000-8000-00000000d002$/,
    );
    await expect(t2.getByText(/\/en\/join$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  });

  test("Hebrew sheet renders right-to-left with Hebrew copy and Hebrew join links", async ({
    page,
  }) => {
    await openAdmin(page, "/he/admin/qr");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("דף QR");
    const first = page.getByTestId("qr-card").first();
    await expect(first).toContainText("סרקו כדי להצטרף");
    await expect(first.getByRole("link")).toHaveAttribute("href", /\/he\/j\//);
  });
});

test.describe("settings (demo venue)", () => {
  test("shows the current name and rules, in Hebrew too", async ({ page }) => {
    await openAdmin(page, "/he/admin/settings");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("הגדרות");
    await expect(page.getByLabel("שם המקום")).toHaveValue("Demo Karaoke Bar");
    await expect(page.getByLabel("זמרים לשיר")).toHaveValue("4");
    await expect(page.getByLabel("לאפשר דואטים")).toBeChecked();
  });

  test("validates with the engine's rules and saves a valid change", async ({ page }) => {
    await openAdmin(page, "/en/admin/settings");
    await page.getByLabel("Singers per song").fill("0");
    await page.getByLabel("Songs waiting per table").fill("-1");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/check the highlighted fields/i)).toBeVisible();
    await expect(page.getByLabel("Singers per song")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Songs waiting per table")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByLabel("Singers per song")).toHaveValue("0");

    await page.getByLabel("Singers per song").fill("6");
    await page.getByLabel("Songs waiting per table").fill("");
    await page.getByLabel("Venue name").fill("Demo Karaoke Bar East");
    await page.getByLabel("DJ approves each request").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toContainText(/saved/i);
    await expect(page.getByTestId("admin-venue-name")).toContainText("Demo Karaoke Bar East");

    await page.reload();
    await expect(page.getByLabel("Singers per song")).toHaveValue("6");
    await expect(page.getByLabel("DJ approves each request")).toBeChecked();
    await expect(page.getByLabel("Venue name")).toHaveValue("Demo Karaoke Bar East");
  });

  test("requires a venue name", async ({ page }) => {
    await openAdmin(page, "/en/admin/settings");
    await page.getByLabel("Venue name").fill("");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/enter a venue name/i)).toBeVisible();
  });
});
