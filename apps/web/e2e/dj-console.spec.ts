import { expect, test } from "@playwright/test";

/**
 * DJ console on the demo night (no Supabase configured, as in CI). With Supabase
 * configured the route needs a signed-in staff member, so the suite skips itself.
 */
test.describe("DJ console (demo night)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/dj");
    test.skip(page.url().includes("/login"), "Supabase configured: console requires sign-in");
  });

  test("shows the singer, the pending requests and the fair queue", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("DJ console");
    await expect(page.getByTestId("now-singing")).toContainText("Sweet Caroline");
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(2);
    await expect(page.getByTestId("queue-row")).toHaveCount(5);
  });

  test("done + auto-start hands the mic to the next fair entry", async ({ page }) => {
    await page.getByTestId("now-singing").getByRole("button", { name: "Done, next" }).click();
    // T2 just sang; the Bar table has not and holds a priority request, so it goes next.
    await expect(page.getByTestId("now-singing")).toContainText("תודה");
    await expect(page.getByTestId("queue-row")).toHaveCount(4);
    await expect(page.getByTestId("player-panel")).toContainText("תודה");
  });

  test("approve moves a request into the queue", async ({ page }) => {
    await page.getByRole("button", { name: "Approve" }).first().click();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(1);
    await expect(page.getByTestId("queue-row")).toHaveCount(6);
    await expect(page.getByTestId("queue-row").last()).toContainText("Wonderwall");
  });

  test("phone layout switches panels with tabs", async ({ page, isMobile }) => {
    test.skip(!isMobile, "tabs only exist below the lg breakpoint");
    await expect(page.getByTestId("queue-panel")).toBeVisible();
    await expect(page.getByTestId("mixer-panel")).toBeHidden();
    await page.getByRole("button", { name: "Mixer" }).click();
    await expect(page.getByTestId("mixer-panel")).toBeVisible();
    await expect(page.getByTestId("queue-panel")).toBeHidden();
  });

  test("Hebrew console renders right-to-left", async ({ page }) => {
    await page.goto("/he/dj");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("קונסולת DJ");
  });
});
