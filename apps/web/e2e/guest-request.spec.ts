import { expect, test, type Page } from "@playwright/test";

/**
 * Guest song request flow on the demo night (no Supabase configured, as in CI).
 * Each browser context gets its own copy of the demo night, keyed by the guest cookie, so
 * tests never see each other's requests. With Supabase configured the demo night does not
 * exist and the suite skips itself.
 */

async function joinTable(page: Page, code: string, name: string) {
  await page.goto("/en/join");
  await page.getByLabel(/table code/i).fill(code);
  await page.getByLabel(/what should we call you/i).fill(name);
  await page.getByRole("button", { name: /^join$/i }).click();
  await expect(page).toHaveURL(/\/en\/guest$/);
}

async function openRequestSheet(page: Page, title: string) {
  await page.getByRole("searchbox", { name: /find a song/i }).fill(title);
  const card = page.getByTestId("song-card").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: /^request /i }).click();
  await expect(page.getByTestId("request-sheet")).toBeVisible();
}

test.describe("guest song request (demo night)", () => {
  test.beforeEach(async ({ page }) => {
    await joinTable(page, "DEMO1", "Dana");
    test.skip(
      (await page.getByTestId("guest-queue").count()) === 0,
      "Supabase configured: demo night unavailable",
    );
  });

  test("requests a duet, sees the place in line and the DJ sees the request", async ({ page }) => {
    await expect(page.getByTestId("guest-queue")).toContainText(/haven't requested anything/i);
    await expect(page.getByTestId("guest-queue")).toContainText(/on the mic: sweet caroline/i);

    await openRequestSheet(page, "I Will Survive");
    const sheet = page.getByTestId("request-sheet");
    await expect(sheet.getByRole("textbox", { name: /singer 1/i })).toHaveValue("Dana");
    await sheet.getByRole("button", { name: /add a singer/i }).click();
    await sheet.getByRole("textbox", { name: /singer 2/i }).fill("Yossi");
    await sheet.getByPlaceholder(/birthday/i).fill("Birthday!");
    await sheet.getByRole("button", { name: /send request/i }).click();

    await expect(sheet).toBeHidden();
    await expect(page.getByRole("status")).toContainText(/sent!/i);
    const mine = page.getByTestId("my-request");
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText("I Will Survive");
    await expect(mine).toContainText("Dana, Yossi");
    // T1 already has two songs waiting; round robin puts Dana's after the other tables' turns.
    await expect(mine.getByTestId("my-position")).toHaveText("6");
    await expect(mine).toContainText(/5 songs before you/i);

    // The DJ console in the same browser shows the request in its fair place.
    await page.goto("/en/dj");
    const row = page.getByTestId("queue-row").filter({ hasText: "I Will Survive" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Dana + Yossi");
    await expect(row).toContainText("Table T1");
  });

  test("a DJ action in the same browser reaches the guest's queue", async ({ page }) => {
    await openRequestSheet(page, "Livin' on a Prayer");
    await page
      .getByTestId("request-sheet")
      .getByRole("button", { name: /send request/i })
      .click();
    await expect(page.getByTestId("my-request")).toHaveCount(1);

    // The DJ skips the guest's song: the demo night is stored server-side per browser.
    await page.goto("/en/dj");
    const row = page.getByTestId("queue-row").filter({ hasText: "Livin' on a Prayer" });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: /^skip$/i }).click();
    await expect(row).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByTestId("queue-row").filter({ hasText: "Livin' on a Prayer" }),
    ).toHaveCount(0);

    await page.goto("/en/guest");
    await expect(page.getByTestId("my-request")).toHaveCount(0);
  });

  test("a second request is rejected with the localized reason", async ({ page }) => {
    await openRequestSheet(page, "Livin' on a Prayer");
    await page
      .getByTestId("request-sheet")
      .getByRole("button", { name: /send request/i })
      .click();
    await expect(page.getByTestId("my-request")).toHaveCount(1);

    await openRequestSheet(page, "שיר לשלום");
    await page
      .getByTestId("request-sheet")
      .getByRole("button", { name: /send request/i })
      .click();
    await expect(page.getByTestId("request-error")).toContainText(/already have a song waiting/i);
    await expect(page.getByTestId("request-sheet")).toBeVisible();
  });

  test("a song that is on the mic is a duplicate", async ({ page }) => {
    await openRequestSheet(page, "Sweet Caroline");
    await page
      .getByTestId("request-sheet")
      .getByRole("button", { name: /send request/i })
      .click();
    await expect(page.getByTestId("request-error")).toContainText(/requested or sung recently/i);
  });

  test("cancel removes the request", async ({ page }) => {
    await openRequestSheet(page, "Livin' on a Prayer");
    await page
      .getByTestId("request-sheet")
      .getByRole("button", { name: /send request/i })
      .click();
    await expect(page.getByTestId("my-request")).toHaveCount(1);

    page.once("dialog", (dialog) => void dialog.accept());
    await page
      .getByTestId("my-request")
      .getByRole("button", { name: /^cancel$/i })
      .click();
    await expect(page.getByTestId("my-request")).toHaveCount(0);
    await expect(page.getByTestId("guest-queue")).toContainText(/haven't requested anything/i);

    // The slot is free again.
    await openRequestSheet(page, "שיר לשלום");
    await page
      .getByTestId("request-sheet")
      .getByRole("button", { name: /send request/i })
      .click();
    await expect(page.getByTestId("my-request")).toContainText("שיר לשלום");
  });

  test("Hebrew sheet renders right-to-left with the guest's name prefilled", async ({ page }) => {
    await page.goto("/he/guest");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const card = page.getByTestId("song-card").filter({ hasText: "I Will Survive" });
    await card.getByRole("button", { name: /לבקש את/ }).click();
    const sheet = page.getByTestId("request-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 2 })).toContainText("I Will Survive");
    await expect(sheet.getByRole("textbox", { name: /זמר\/ת 1/ })).toHaveValue("Dana");
  });
});
