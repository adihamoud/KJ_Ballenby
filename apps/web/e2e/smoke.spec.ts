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

test("landing asks new user, existing user or guest, with one venue link", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("link", { name: /i'm new here/i }).click();
  await expect(page).toHaveURL(/\/en\/signup$/);

  await page.goto("/en");
  await page.getByRole("link", { name: /i have an account/i }).click();
  await expect(page).toHaveURL(/\/en\/login$/);

  await page.goto("/en");
  await expect(page.getByRole("link", { name: /manage your venue/i })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /staff sign in/i })).toHaveCount(0);
});

for (const [path, submit] of [
  ["/en/login", /^sign in$/i],
  ["/en/signup", /^create account$/i],
] as const) {
  test(`${path} offers email, phone, Google and Microsoft`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /microsoft/i })).toBeVisible();
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: submit })).toBeVisible();
    await page.getByRole("button", { name: /^phone$/i }).click();
    await expect(page.getByLabel(/phone number/i)).toBeVisible();
  });
}

test("sign-up asks for a name; sign-in does not", async ({ page }) => {
  await page.goto("/en/signup");
  await expect(page.getByLabel(/your name/i)).toBeVisible();
  await page.getByTestId("auth-switch").click();
  await expect(page).toHaveURL(/\/en\/login$/);
  await expect(page.getByLabel(/your name/i)).toHaveCount(0);
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

test.describe("guest join (demo tables, no Supabase)", () => {
  test("landing offers a guest button that leads to the join page", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("link", { name: /join as guest/i }).click();
    await expect(page).toHaveURL(/\/en\/join$/);
    await expect(page.getByLabel(/table code/i)).toBeVisible();
  });

  test("typing a table code and a name lands on the guest home", async ({ page }) => {
    await page.goto("/en/join");
    await page.getByLabel(/table code/i).fill("demo1");
    await page.getByLabel(/what should we call you/i).fill("Dana");
    await page.getByRole("button", { name: /^join$/i }).click();
    await expect(page).toHaveURL(/\/en\/guest$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("T1");
    await expect(page.getByText(/joined as dana/i)).toBeVisible();

    await page.getByRole("button", { name: /leave table/i }).click();
    await expect(page).toHaveURL(/\/en\/join$/);
  });

  test("an unknown code shows an inline error, not an error page", async ({ page }) => {
    await page.goto("/en/join");
    await page.getByLabel(/table code/i).fill("NOPE1");
    await page.getByLabel(/what should we call you/i).fill("Dana");
    await page.getByRole("button", { name: /^join$/i }).click();
    await expect(page.getByText(/couldn't find a table/i)).toBeVisible();
    await expect(page).toHaveURL(/\/en\/join$/);
  });

  test("a QR link resolves the table and asks only for a name", async ({ page }) => {
    await page.goto("/he/j/00000000-0000-4000-8000-00000000d002");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("T2");
    await expect(page.getByLabel(/קוד השולחן/)).toHaveCount(0);
    await page.getByLabel(/איך קוראים לכם/).fill("דנה");
    await page.getByRole("button", { name: /זה השולחן שלי/ }).click();
    await expect(page).toHaveURL(/\/he\/guest$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("T2");
  });

  test("a dead QR token explains itself and offers the code form", async ({ page }) => {
    await page.goto("/en/j/not-a-real-token");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/no longer active/i);
    await page.getByRole("link", { name: /enter a code/i }).click();
    await expect(page).toHaveURL(/\/en\/join$/);
  });

  test("guest home without a session redirects to join", async ({ page }) => {
    await page.goto("/en/guest");
    await expect(page).toHaveURL(/\/en\/join$/);
  });
});

test.describe("guest catalog search (demo catalog, no Supabase)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/join");
    await page.getByLabel(/table code/i).fill("DEMO2");
    await page.getByLabel(/what should we call you/i).fill("Dana");
    await page.getByRole("button", { name: /^join$/i }).click();
    await expect(page).toHaveURL(/\/en\/guest$/);
  });

  test("lists the catalog with YouTube thumbnails and version links", async ({ page }) => {
    const cards = page.getByTestId("song-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(10);

    const bohemian = cards.filter({ hasText: "Bohemian Rhapsody" });
    await expect(bohemian.locator("img")).toHaveAttribute("src", /i\.ytimg\.com|_next\/image/);
    const versions = bohemian.getByRole("link", { name: /sing king|starlight|zoom/i });
    expect(await versions.count()).toBeGreaterThanOrEqual(2);
    await expect(versions.first()).toHaveAttribute("href", /youtube\.com\/watch\?v=[\w-]{11}/);
  });

  test("filters as you type and by language, in Hebrew too", async ({ page }) => {
    await page.getByRole("searchbox", { name: /find a song/i }).fill("queen");
    await expect(page.getByTestId("song-card")).toHaveCount(2);
    await expect(page.getByText("Dancing Queen")).toBeVisible();

    await page.getByRole("searchbox", { name: /find a song/i }).fill("");
    await page.getByRole("button", { name: /^hebrew$/i }).click();
    await expect(page.getByText("הללויה")).toBeVisible();
    await expect(page.getByText("Wonderwall")).toHaveCount(0);

    await page.getByRole("searchbox", { name: /find a song/i }).fill("zzzz");
    await expect(page.getByText(/no songs match/i)).toBeVisible();
  });
});
