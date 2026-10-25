import { expect, test } from "@playwright/test";
import { A11Y_STORAGE_KEY } from "../src/lib/a11y/preferences";
import { A11Y_SCANS, DEMO_TABLE_CODE } from "../src/lib/a11y/routes";

/**
 * What axe cannot see: keyboard paths and reflow (docs/ACCESSIBILITY.md). Demo mode, like the
 * rest of the suite.
 */

test.describe("keyboard", () => {
  // Desktop Safari skips links on Tab unless the user turns on "Press Tab to highlight each
  // item", and WebKit in Playwright behaves the same; the Chromium run covers the skip link.
  test("the first Tab reaches the skip link, which moves focus into <main>", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === "webkit", "WebKit does not Tab to links by default");
    await page.goto("/en");
    await page.keyboard.press("Tab");
    const skip = page.getByTestId("skip-link");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await expect(skip).toHaveText("Skip to main content");
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });

  test("the skip link is in Hebrew on Hebrew pages", async ({ page }) => {
    await page.goto("/he");
    await expect(page.getByTestId("skip-link")).toHaveText("דילוג לתוכן הראשי");
  });

  test("the request sheet traps Tab, closes on Escape and gives focus back", async ({ page }) => {
    await page.goto("/en/join");
    await page.getByLabel(/table code/i).fill(DEMO_TABLE_CODE);
    await page.getByLabel(/what should we call you/i).fill("Dana");
    await page.getByRole("button", { name: /^join$/i }).click();
    await expect(page).toHaveURL(/\/en\/guest$/);

    const opener = page.getByRole("button", { name: /^request /i }).first();
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: /singer 1/i })).toBeFocused();

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe("reflow at 320 CSS px (WCAG 1.4.10)", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const scan of A11Y_SCANS.filter((s) => !s.as && !s.open)) {
    test(`${scan.name} does not scroll sideways`, async ({ page }) => {
      if (scan.prefs) {
        await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
          A11Y_STORAGE_KEY,
          JSON.stringify(scan.prefs),
        ] as const);
      }
      await page.goto(`/en${scan.path}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("accessibility menu", () => {
  test("applies settings at once, keeps them after a reload and resets them", async ({ page }) => {
    await page.goto("/en");
    const html = page.locator("html");
    const opener = page.getByTestId("a11y-menu-button");
    await opener.click();
    const menu = page.getByRole("dialog", { name: "Accessibility settings" });
    await expect(menu).toBeVisible();

    await menu.locator("label", { hasText: "Larger" }).click();
    await expect(menu.getByRole("radio", { name: /larger/i })).toBeChecked();
    await menu.getByRole("checkbox", { name: /high contrast/i }).check();
    await menu.getByRole("checkbox", { name: /stop animations/i }).check();
    await menu.getByRole("checkbox", { name: /underline links/i }).check();
    await expect(html).toHaveAttribute("data-a11y-text", "larger");
    await expect(html).toHaveAttribute("data-a11y-contrast", "high");
    await expect(html).toHaveAttribute("data-a11y-motion", "reduce");
    await expect(html).toHaveAttribute("data-a11y-links", "underline");
    const rootSize = () =>
      page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(await rootSize()).toBeGreaterThan(20);

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(opener).toBeFocused();

    // Applied before hydration by the boot script, on every page.
    await page.goto("/en/join");
    await expect(html).toHaveAttribute("data-a11y-text", "larger");
    await expect(html).toHaveAttribute("data-a11y-contrast", "high");

    await page.getByTestId("a11y-menu-button").click();
    await page.getByRole("button", { name: /reset to default/i }).click();
    await expect(html).not.toHaveAttribute("data-a11y-text", /.*/);
    await expect(html).not.toHaveAttribute("data-a11y-contrast", /.*/);
    await page.reload();
    await expect(html).not.toHaveAttribute("data-a11y-text", /.*/);
  });

  test("is in Hebrew on Hebrew pages and links to the statement", async ({ page }) => {
    await page.goto("/he");
    await page.getByTestId("a11y-menu-button").click();
    const menu = page.getByRole("dialog", { name: "הגדרות נגישות" });
    await expect(menu.getByRole("radio", { name: /גדול מאוד/ })).toBeVisible();
    await menu.getByRole("link", { name: "הצהרת נגישות" }).click();
    await expect(page).toHaveURL(/\/he\/accessibility$/);
  });
});

test.describe("accessibility statement", () => {
  test("is linked from every footer and says the contact is pending until configured", async ({
    page,
  }) => {
    await page.goto("/en/join");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Accessibility statement" })
      .click();
    await expect(page).toHaveURL(/\/en\/accessibility$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accessibility statement");
    await expect(page.getByText(/WCAG 2\.2/)).toBeVisible();
    await expect(page.getByText(/IS 5568/)).toBeVisible();
    await expect(page.getByTestId("a11y-contact-pending")).toBeVisible();
  });

  test("renders in Hebrew, right-to-left", async ({ page }) => {
    await page.goto("/he/accessibility");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("הצהרת נגישות");
    await expect(page.getByText(/ת"י 5568/)).toBeVisible();
  });
});
