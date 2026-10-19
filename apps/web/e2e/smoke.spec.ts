import { expect, test } from "@playwright/test";

test.describe("locale detection", () => {
  test.describe("Hebrew browser", () => {
    test.use({ locale: "he-IL" });

    test("root redirects to Hebrew and renders right-to-left", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/he$/);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "he");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });

  test.describe("English browser", () => {
    test.use({ locale: "en-US" });

    test("root redirects to English and renders left-to-right", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/en$/);
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    });
  });

  test.describe("unsupported browser language", () => {
    test.use({ locale: "fr-FR" });

    test("falls back to Hebrew, the default locale", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/he$/);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    });
  });
});

test("English locale page renders left-to-right", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sing in turn");
});

test("locale switcher changes language and direction", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("combobox", { name: /language/i }).selectOption("he");
  await expect(page).toHaveURL(/\/he$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("login page shows all three sign-in methods", async ({ page }) => {
  await page.goto("/en/login");
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /microsoft/i })).toBeVisible();
  await expect(page.getByLabel(/phone number/i)).toBeVisible();
});

test("protected app route redirects anonymous users to login", async ({ page }) => {
  await page.goto("/en/app");
  await expect(page).toHaveURL(/\/en\/login/);
});

test("web app manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.dir).toBe("rtl");
});
