import { expect, test } from "@playwright/test";

const SECTION_IDS = ["who", "collect", "cookies", "sharing", "retention", "rights", "changes"];

for (const locale of ["he", "en"] as const) {
  const dir = locale === "he" ? "rtl" : "ltr";

  test.describe(`privacy notice (${locale})`, () => {
    test("privacy page renders server-side without login", async ({ page, context, baseURL }) => {
      const origins = new Set<string>();
      page.on("request", (req) => origins.add(new URL(req.url()).origin));

      const res = await page.goto(`/${locale}/privacy`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const sections = page.locator("main > section");
      await expect(sections).toHaveCount(SECTION_IDS.length);
      for (const [index, id] of SECTION_IDS.entries()) {
        await expect(sections.nth(index)).toHaveAttribute("data-testid", `privacy-${id}`);
        await expect(page.getByTestId(`privacy-${id}`)).toBeVisible();
      }
      await expect(page.getByTestId("privacy-contact")).toHaveAttribute("href", /^mailto:/);
      await expect(page.getByTestId("privacy-contact")).toHaveAttribute("dir", "ltr");

      const appOrigin = new URL(baseURL ?? "http://localhost:3000").origin;
      expect([...origins].filter((o) => o !== appOrigin)).toEqual([]);

      const cookieNames = (await context.cookies()).map((c) => c.name);
      expect(cookieNames.filter((name) => name !== "NEXT_LOCALE")).toEqual([]);
    });

    test.describe("without JavaScript", () => {
      test.use({ javaScriptEnabled: false });

      test("works without JavaScript", async ({ page }) => {
        await page.goto(`/${locale}/privacy`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByTestId("privacy-rights")).toBeVisible();
      });
    });

    test("footer links to the notice", async ({ page }) => {
      await page.goto(`/${locale}`);
      await page.getByTestId("footer-privacy").click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/privacy$`));
    });

    test("join form shows the notice at the name field", async ({ page }) => {
      for (const path of [`/${locale}/join`, `/${locale}/j/DEMO1`]) {
        await page.goto(path);
        await expect(page.locator('input[name="name"]')).toHaveAttribute(
          "aria-describedby",
          "join-name-privacy",
        );
        await page.getByTestId("join-privacy").click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/privacy$`));
      }
    });

    test("sign-up and login show the notice", async ({ page }) => {
      for (const path of [`/${locale}/signup`, `/${locale}/login`]) {
        await page.goto(path);
        const notice = page.getByTestId("auth-privacy");
        await expect(notice).toBeVisible();
        await notice.getByRole("link").click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/privacy$`));
      }
    });
  });
}

test("NEXT_LOCALE is a session cookie (privacy notice cookie row)", async ({ page, context }) => {
  await page.goto("/en");
  await page.getByRole("combobox", { name: /language/i }).selectOption("he");
  await expect(page).toHaveURL(/\/he$/);
  const cookie = (await context.cookies()).find((c) => c.name === "NEXT_LOCALE");
  expect(cookie?.expires).toBe(-1);
});
