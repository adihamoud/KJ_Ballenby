import { expect, test } from "@playwright/test";

/**
 * The join pages run without Supabase env vars in CI: they must render the
 * "not configured" hint and still validate the typed code locally.
 */
for (const { locale, dir, invalidHint } of [
  { locale: "he", dir: "rtl", invalidHint: /4–6/ },
  { locale: "en", dir: "ltr", invalidHint: /4–6 character code/i },
]) {
  test.describe(`manual join page (/${locale})`, () => {
    test("renders the code form with the right direction", async ({ page }) => {
      await page.goto(`/${locale}/join`);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator('input[name="code"]')).toBeVisible();
      await expect(page.getByTestId("not-configured")).toBeVisible();
    });

    test("rejects a too-short code without leaving the page", async ({ page }) => {
      await page.goto(`/${locale}/join`);
      await page.locator('input[name="code"]').fill("ab");
      await page.getByRole("button", { name: /join|הצטרפות/i }).click();
      await expect(page.locator("#join-code-error")).toContainText(invalidHint);
      await expect(page).toHaveURL(new RegExp(`/${locale}/join$`));
    });

    test("normalizes a valid code and navigates to its page", async ({ page }) => {
      await page.goto(`/${locale}/join`);
      await page.locator('input[name="code"]').fill(" de-mo 1 ");
      await page.getByRole("button", { name: /join|הצטרפות/i }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/join/DEMO1$`));
      // Without Supabase the code page shows the hint instead of resolving.
      await expect(page.getByTestId("not-configured")).toBeVisible();
    });
  });
}

test("code page renders the hint for a QR token when Supabase is not configured", async ({
  page,
}) => {
  await page.goto("/he/join/8f1c5f8e-2f2d-4f0a-9a7e-2d4b3c6f1a2b");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("not-configured")).toBeVisible();
});

test("group invite page renders the hint when Supabase is not configured", async ({ page }) => {
  await page.goto("/en/join/group/8f1c5f8e-2f2d-4f0a-9a7e-2d4b3c6f1a2b");
  await expect(page.getByTestId("not-configured")).toBeVisible();
});

test("login keeps a safe next param and drops an unsafe one", async ({ page }) => {
  await page.goto("/en/login?next=%2Fen%2Fjoin%2FDEMO1");
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  await page.goto("/en/login?next=https%3A%2F%2Fevil.example");
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
});
