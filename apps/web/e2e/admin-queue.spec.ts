import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Queue management from the venue admin, on the demo night (no Supabase configured, as in CI).
 * With Supabase configured the route needs a signed-in owner, so the suite skips itself.
 */

async function openQueue(page: Page, path: string) {
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

test.describe("admin queue (demo night)", () => {
  test("lists tonight's queue under the Queue tab", async ({ page }) => {
    await openQueue(page, "/en/admin/queue");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tonight’s queue");
    await expect(
      page.getByTestId("admin-nav").getByRole("link", { name: "Queue", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("now-singing")).toContainText("Sweet Caroline");
    await expect(page.getByTestId("queue-row")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(2);
  });

  test("moves a song down and another up; moved songs stay where they were put", async ({
    page,
  }) => {
    await openQueue(page, "/en/admin/queue");
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
    await openQueue(page, "/en/admin/queue");
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
    // Move in steps: the drag starts after a few pixels and follows the pointer.
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y - 20, { steps: 25 });
    await page.mouse.up();

    await expect.poll(async () => (await rowTitles(page))[0]).toBe(before[4]);
    expect((await rowTitles(page)).slice(1)).toEqual(before.slice(0, 4));
    await expect(rows.nth(0)).toContainText("Moved by hand");
  });

  test("the overview links to the queue", async ({ page }) => {
    await openQueue(page, "/en/admin");
    await page.getByRole("link", { name: "Manage the queue" }).click();
    await expect(page).toHaveURL(/\/en\/admin\/queue$/);
  });

  test("renders in Hebrew, right-to-left", async ({ page }) => {
    await openQueue(page, "/he/admin/queue");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("התור של הערב");
    await expect(page.getByTestId("queue-row").first()).toBeVisible();
  });
});
