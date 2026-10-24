import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The DJ console inside the venue admin, on the demo night (no Supabase configured, as in CI).
 * The demo night without a guest cookie lives in the browser only, so a remount of the console
 * would reset it: that is how the "stays mounted across tabs" test can tell. With Supabase
 * configured the route needs a signed-in owner, so the suite skips itself.
 */

async function openAdmin(page: Page, path: string) {
  await page.goto(path);
  test.skip(page.url().includes("/login"), "Supabase configured: admin requires sign-in");
}

async function rowTitles(page: Page): Promise<string[]> {
  const rows = page.getByTestId("queue-row");
  const n = await rows.count();
  const titles: string[] = [];
  for (let i = 0; i < n; i++) {
    const text = await rows.nth(i).locator("p").first().innerText();
    titles.push(text.split("·")[0]!.trim());
  }
  return titles;
}

test.describe("admin DJ console (demo night)", () => {
  test("is the DJ tab of the admin, with the queue", async ({ page }) => {
    await openAdmin(page, "/en/admin/dj");
    await expect(
      page.getByTestId("admin-nav").getByRole("link", { name: "DJ console" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 }).last()).toContainText("DJ console");
    await expect(page.getByTestId("now-singing")).toContainText("Sweet Caroline");
    await expect(page.getByTestId("queue-row")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(2);
  });

  test("the old queue address leads to the DJ tab", async ({ page }) => {
    await openAdmin(page, "/en/admin/queue");
    await expect(page).toHaveURL(/\/en\/admin\/dj$/);
  });

  test("moves a song down and another up; moved songs stay where they were put", async ({
    page,
  }) => {
    await openAdmin(page, "/en/admin/dj");
    await expect(page.getByTestId("queue-row")).toHaveCount(5);
    const before = await rowTitles(page);

    await page.getByTestId("queue-row").nth(0).getByRole("button", { name: "Move down" }).click();
    await expect.poll(() => rowTitles(page)).not.toEqual(before);
    const afterDown = await rowTitles(page);
    expect(afterDown[1]).toBe(before[0]);
    expect(afterDown[0]).toBe(before[1]);
    await expect(page.getByTestId("queue-row").nth(1)).toContainText("Moved by hand");

    const last = afterDown.length - 1;
    await page.getByTestId("queue-row").nth(last).getByRole("button", { name: "Move up" }).click();
    await expect.poll(async () => (await rowTitles(page))[last - 1]).toBe(afterDown[last]);
  });

  test("drags the last song to the top by its handle", async ({ page }) => {
    await openAdmin(page, "/en/admin/dj");
    const rows = page.getByTestId("queue-row");
    await expect(rows).toHaveCount(5);
    const before = await rowTitles(page);

    const handle = rows.nth(4).getByTestId("drag-handle");
    const target = rows.nth(0).getByTestId("drag-handle");
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error("handles not laid out");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y - 20, { steps: 25 });
    await page.mouse.up();

    await expect.poll(async () => (await rowTitles(page))[0]).toBe(before[4]);
    expect((await rowTitles(page)).slice(1)).toEqual(before.slice(0, 4));
    await expect(rows.nth(0)).toContainText("Moved by hand");
  });

  test("a table name opens that table's card and links to the tables board", async ({ page }) => {
    await openAdmin(page, "/en/admin/dj");
    const chip = page.getByTestId("queue-row").first().getByTestId("table-chip");
    const label = (await chip.innerText()).replace(/^Table\s+/, "").trim();
    await chip.click();
    const card = page.getByTestId("table-card-popover");
    await expect(card).toBeVisible();
    await expect(card).toContainText(label);
    await expect(card.getByTestId("table-card-next")).toContainText("Next turn");
    await expect(card.getByTestId("table-card-guests")).toBeVisible();

    await card.getByTestId("table-card-link").click();
    await expect(page).toHaveURL(/\/en\/admin\/tonight#table-/);
    await expect(
      page.locator(`[data-testid=table-card][data-table-label="${label}"]`),
    ).toHaveAttribute("data-highlighted", "true");
  });

  test("stays mounted while another admin tab is open", async ({ page }) => {
    await openAdmin(page, "/en/admin/dj");
    await page.getByTestId("queue-row").nth(0).getByRole("button", { name: "Move down" }).click();
    await expect(page.getByTestId("queue-row").nth(1)).toContainText("Moved by hand");
    const moved = await rowTitles(page);

    await page.getByTestId("admin-nav").getByRole("link", { name: "Tables tonight" }).click();
    await expect(page).toHaveURL(/\/en\/admin\/tonight$/);
    await expect(page.getByTestId("table-card").first()).toBeVisible();
    await page.getByTestId("admin-nav").getByRole("link", { name: "DJ console" }).click();
    await expect(page).toHaveURL(/\/en\/admin\/dj$/);

    // A fresh console would show the seeded order again; the kept one shows the move.
    expect(await rowTitles(page)).toEqual(moved);
    await expect(page.getByTestId("queue-row").nth(1)).toContainText("Moved by hand");
  });

  test("the overview links to the DJ console", async ({ page }) => {
    await openAdmin(page, "/en/admin");
    await page.getByRole("link", { name: "Open the DJ console" }).click();
    await expect(page).toHaveURL(/\/en\/admin\/dj$/);
  });

  test("renders in Hebrew, right-to-left", async ({ page }) => {
    await openAdmin(page, "/he/admin/dj");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 }).last()).toContainText("קונסולת DJ");
    await expect(page.getByTestId("queue-row").first()).toBeVisible();
  });
});
