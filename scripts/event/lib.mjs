// Event-simulation helpers: drive the guest PWA and the DJ console with Playwright against a
// running server (default http://localhost:3100, override with EVENT_BASE_URL), plus direct
// Supabase REST calls with a guest's own access token for RLS probes.
//
// Usage from a script in scripts/event/runs/*.mjs:
//   import { launch, newGuest, newDj, rest, rpc } from "../lib.mjs";
//   const browser = await launch();
//   const dana = await newGuest(browser);
//   console.log(await dana.join("DEMO1", "Dana"));
//   console.log(await dana.request("I Will Survive", { singers: ["Dana", "Yossi"], note: "Birthday" }));
//   console.log(await dana.queue());
//   await browser.close();
import { createRequire } from "node:module";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicEnv } from "./with-env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const requireWeb = createRequire(path.join(root, "apps", "web", "package.json"));
const { chromium, devices } = requireWeb("@playwright/test");

export const BASE = process.env.EVENT_BASE_URL ?? "http://localhost:3100";
export const STATE_DIR = path.join(here, ".state");
export const SUPABASE = loadPublicEnv();
export const DEMO_VENUE_ID = "00000000-0000-0000-0000-000000000001";
mkdirSync(STATE_DIR, { recursive: true });

const T = 20_000;

export async function launch({ headless = true } = {}) {
  return chromium.launch({ headless });
}

function clean(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

async function textOrNull(locator) {
  return (await locator.count()) > 0 ? clean(await locator.first().innerText()) : null;
}

/** Decode the @supabase/ssr auth cookie (possibly chunked) into the session object. */
async function sessionFromCookies(context) {
  const cookies = await context.cookies(BASE);
  const chunks = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => {
      const ia = Number(a.name.split(".").pop()) || 0;
      const ib = Number(b.name.split(".").pop()) || 0;
      return ia - ib;
    });
  if (chunks.length === 0) return null;
  let raw = chunks.map((c) => c.value).join("");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* already decoded */
  }
  if (raw.startsWith("base64-")) {
    const b64 = raw.slice("base64-".length).replace(/-/g, "+").replace(/_/g, "/");
    raw = Buffer.from(b64, "base64").toString("utf8");
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Visible alerts, excluding Next.js's route announcer (which also carries role="alert"). */
function alerts(page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

function decodeJwt(token) {
  const [, payload] = token.split(".");
  return JSON.parse(
    Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  );
}

// ---------------------------------------------------------------------------
// Guest
// ---------------------------------------------------------------------------
export async function newGuest(browser, { locale = "en", stateFile = null, mobile = true } = {}) {
  const opts = mobile ? { ...devices["Pixel 7"] } : {};
  if (stateFile && existsSync(stateFile)) opts.storageState = stateFile;
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  page.setDefaultTimeout(T);
  const L = `/${locale}`;

  const guest = {
    page,
    context,
    locale,

    async goto(p) {
      await page.goto(`${BASE}${L}${p}`);
      return page.url();
    },

    /** Type a table code and a name on /join. Returns {ok, url, error}. */
    async join(code, name) {
      await page.goto(`${BASE}${L}/join`);
      await page.getByLabel(/table code|קוד השולחן/i).fill(code);
      await page.getByLabel(/what should we call you|איך קוראים לכם/i).fill(name);
      await page.getByRole("button", { name: /^(join|הצטרפות)$/i }).click();
      return waitJoinOutcome();
    },

    /** Open a printed QR link /j/<token> and confirm with a name. */
    async joinByToken(token, name) {
      await page.goto(`${BASE}${L}/j/${token}`);
      const nameField = page.getByLabel(/what should we call you|איך קוראים לכם/i);
      if ((await nameField.count()) === 0) {
        return {
          ok: false,
          url: page.url(),
          error: clean(await page.locator("h1").first().innerText()),
        };
      }
      await nameField.fill(name);
      await page.getByRole("button", { name: /yes, that's my table|זה השולחן שלי/i }).click();
      return waitJoinOutcome();
    },

    /** Guest home summary: table, status line, queue card and own requests. */
    async home() {
      if (!page.url().includes(`${L}/guest`)) await page.goto(`${BASE}${L}/guest`);
      return readHome();
    },

    async refresh() {
      await page.reload();
      return readHome();
    },

    /** Current queue card without reloading (lets realtime/polling do its work). */
    async queue() {
      return readQueue();
    },

    /** Wait until a predicate over queue() holds (polls the DOM, no reload). */
    async waitForQueue(predicate, { timeout = 30_000, step = 500 } = {}) {
      const start = Date.now();
      let last = null;
      while (Date.now() - start < timeout) {
        last = await readQueue();
        if (predicate(last)) return { ok: true, ms: Date.now() - start, queue: last };
        await page.waitForTimeout(step);
      }
      return { ok: false, ms: Date.now() - start, queue: last };
    },

    /** Type in the search box (and optionally pick a language chip). Returns visible titles. */
    async search(q, lang = null) {
      const box = page.getByRole("searchbox", { name: /find a song|חיפוש שיר/i });
      await box.fill(q);
      if (lang) {
        const name =
          lang === "he"
            ? /^(hebrew|עברית)$/i
            : lang === "en"
              ? /^(english|אנגלית)$/i
              : /^(all|הכל)$/i;
        await page.getByRole("button", { name }).click();
      }
      await page.waitForTimeout(350);
      await page
        .locator("ul[aria-busy=true]")
        .waitFor({ state: "detached", timeout: 8000 })
        .catch(() => {});
      const cards = page.getByTestId("song-card");
      const n = await cards.count();
      const titles = [];
      for (let i = 0; i < n; i++)
        titles.push(clean(await cards.nth(i).locator("p").first().innerText()));
      return titles;
    },

    /**
     * Request a song by title. singers[0] defaults to the prefilled guest name.
     * Returns {ok:true, toast} or {ok:false, error, sheetOpen}.
     */
    async request(title, { singers = null, note = "", viaSearch = true } = {}) {
      if (viaSearch) await guest.search(title);
      const card = page.getByTestId("song-card").filter({ hasText: title }).first();
      if ((await card.count()) === 0) return { ok: false, error: `no card for ${title}` };
      const btn = card.getByRole("button", { name: /^(request|לבקש|בקשה)/i });
      if ((await btn.count()) === 0)
        return { ok: false, error: "no request button (night closed or not joined)" };
      await btn.click();
      const sheet = page.getByTestId("request-sheet");
      await sheet.waitFor({ state: "visible" });
      if (singers) {
        for (let i = 0; i < singers.length; i++) {
          if (i > 0) {
            const add = sheet.getByRole("button", { name: /add a singer|הוספת זמר/i });
            if ((await add.count()) === 0) break; // venue limit reached
            await add.click();
          }
          await sheet
            .getByRole("textbox", { name: new RegExp(`(singer|זמר/ת) ${i + 1}$`, "i") })
            .fill(singers[i]);
        }
      }
      if (note) await sheet.locator("textarea").fill(note);
      await sheet.getByRole("button", { name: /send request|שליחת בקשה/i }).click();
      const toast = page.getByRole("status");
      const err = page.getByTestId("request-error");
      const outcome = await Promise.race([
        toast.waitFor({ state: "visible", timeout: T }).then(() => "toast"),
        err.waitFor({ state: "visible", timeout: T }).then(() => "error"),
      ]).catch(() => "timeout");
      if (outcome === "toast") return { ok: true, toast: clean(await toast.innerText()) };
      if (outcome === "error") {
        const error = clean(await err.innerText());
        return { ok: false, error, sheetOpen: await sheet.isVisible() };
      }
      return {
        ok: false,
        error: "timeout waiting for response",
        sheetOpen: await sheet.isVisible(),
      };
    },

    /** Close an open request sheet (Escape). */
    async closeSheet() {
      await page.keyboard.press("Escape");
    },

    /** Cancel the n-th own request (0-based). Accepts the confirm dialog. */
    async cancel(index = 0) {
      const mine = page.getByTestId("my-request");
      if ((await mine.count()) <= index) return { ok: false, error: "no such request" };
      page.once("dialog", (d) => void d.accept());
      await mine
        .nth(index)
        .getByRole("button", { name: /^(cancel|ביטול)$/i })
        .click();
      await page.waitForTimeout(800);
      return { ok: true, queue: await readQueue() };
    },

    async leave() {
      await page.getByRole("button", { name: /leave table|עזיבת השולחן/i }).click();
      await page.waitForURL(/\/join$/);
      return page.url();
    },

    /** The guest's Supabase session (access token, user id) from the auth cookie. */
    async session() {
      const s = await sessionFromCookies(context);
      if (!s?.access_token) return null;
      const claims = decodeJwt(s.access_token);
      return {
        accessToken: s.access_token,
        userId: claims.sub,
        isAnonymous: claims.is_anonymous,
        role: claims.role,
      };
    },

    async guestCookie() {
      const c = (await context.cookies(BASE)).find((x) => x.name === "kj_guest");
      return c ? JSON.parse(decodeURIComponent(c.value)) : null;
    },

    async saveState(file) {
      await context.storageState({ path: file });
      return file;
    },

    async screenshot(file) {
      await page.screenshot({ path: file, fullPage: true });
      return file;
    },

    async text() {
      return clean(await page.locator("body").innerText());
    },

    async close() {
      await context.close();
    },
  };

  async function waitJoinOutcome() {
    const alert = alerts(page);
    const result = await Promise.race([
      page.waitForURL(/\/guest$/, { timeout: T }).then(() => "guest"),
      alert.waitFor({ state: "visible", timeout: T }).then(() => "alert"),
    ]).catch(() => "timeout");
    if (result === "guest") return { ok: true, url: page.url(), ...(await readHome()) };
    if (result === "alert")
      return { ok: false, url: page.url(), error: clean(await alert.innerText()) };
    return { ok: false, url: page.url(), error: "timeout" };
  }

  async function readHome() {
    const h1 = await textOrNull(page.locator("h1"));
    const status = await textOrNull(page.locator("section[aria-live=polite]").first());
    const joinedAs = await textOrNull(page.getByText(/joined as|הצטרפתם בתור/i));
    const canRequest =
      (await page.getByRole("button", { name: /^(request|לבקש|בקשה)/i }).count()) > 0;
    const retryIdentity =
      (await page.getByRole("button", { name: /^(try again|נסו שוב)$/i }).count()) > 0;
    const catalog = await page.getByTestId("song-card").count();
    return {
      table: h1,
      status,
      joinedAs,
      canRequest,
      retryIdentity,
      catalog,
      ...(await readQueue()),
    };
  }

  async function readQueue() {
    const card = page.getByTestId("guest-queue");
    if ((await card.count()) === 0) return { hasQueueCard: false, mine: [] };
    const nowSinging = await textOrNull(card.getByText(/on the mic:|על המיקרופון:/i));
    const length = await textOrNull(card.getByText(/in the queue|queue is empty|בתור|התור ריק/i));
    const upNext = await textOrNull(card.getByText(/you're up next|אתם הבאים/i));
    const error = await textOrNull(card.locator('[role="alert"]'));
    const identityError = await textOrNull(
      page.locator("main").getByText(/couldn't sign you in as a guest|לא הצלחנו לחבר אתכם/i),
    );
    const rows = card.getByTestId("my-request");
    const n = await rows.count();
    const mine = [];
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const ps = row.locator("p");
      mine.push({
        title: clean(await ps.nth(0).innerText()),
        singers: clean(await ps.nth(1).innerText()),
        place: clean(await ps.nth(2).innerText()),
        position: await textOrNull(row.getByTestId("my-position")),
        onMic: (await row.getByText(/on the mic|על המיקרופון/i).count()) > 0,
        canCancel: (await row.getByRole("button", { name: /^(cancel|ביטול)$/i }).count()) > 0,
      });
    }
    return { hasQueueCard: true, nowSinging, length, upNext, error, identityError, mine };
  }

  return guest;
}

// ---------------------------------------------------------------------------
// DJ
// ---------------------------------------------------------------------------
export async function newDj(
  browser,
  { locale = "en", stateFile = path.join(STATE_DIR, "dj.json") } = {},
) {
  const opts = { viewport: { width: 1400, height: 1000 } };
  if (stateFile && existsSync(stateFile)) opts.storageState = stateFile;
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  page.setDefaultTimeout(T);
  const L = `/${locale}`;

  const dj = {
    page,
    context,

    /** Open the console. Returns {ok, notStaff, redirectedToLogin, nightOn}. */
    async open() {
      await page.goto(`${BASE}${L}/dj`);
      await page.waitForLoadState("networkidle").catch(() => {});
      const url = page.url();
      if (url.includes("/login")) return { ok: false, redirectedToLogin: true, url };
      const notStaff = (await page.getByText(/not on any venue's staff|אינכם בצוות/i).count()) > 0;
      if (notStaff) return { ok: false, notStaff: true, url };
      return { ok: true, url, ...(await readSnapshot()) };
    },

    async snapshot() {
      return readSnapshot();
    },

    async waitFor(predicate, { timeout = 30_000, step = 500 } = {}) {
      const start = Date.now();
      let last = null;
      while (Date.now() - start < timeout) {
        last = await readSnapshot();
        if (predicate(last)) return { ok: true, ms: Date.now() - start, snapshot: last };
        await page.waitForTimeout(step);
      }
      return { ok: false, ms: Date.now() - start, snapshot: last };
    },

    async approve(title) {
      const row = pendingRow(title);
      await row.getByRole("button", { name: /^(approve|אישור)$/i }).click();
      return settle();
    },
    async skipPending(title) {
      await pendingRow(title)
        .getByRole("button", { name: /^(skip|דילוג)$/i })
        .click();
      return settle();
    },
    async start(title) {
      await queueRow(title)
        .getByRole("button", { name: /^(start|התחלה)$/i })
        .click();
      return settle();
    },
    async skip(title) {
      await queueRow(title)
        .getByRole("button", { name: /^(skip|דילוג)$/i })
        .click();
      return settle();
    },
    async move(title, direction) {
      const name = direction === "up" ? /move up|הזזה למעלה/i : /move down|הזזה למטה/i;
      await queueRow(title).getByRole("button", { name }).click();
      return settle();
    },
    async pin(title) {
      await queueRow(title)
        .getByRole("button", { name: /^(pin|unpin|הצמדה|ביטול הצמדה)$/i })
        .click();
      return settle();
    },
    async priority(title, direction) {
      const name =
        direction === "up" ? /raise priority|העלאת עדיפות/i : /lower priority|הורדת עדיפות/i;
      const btn = queueRow(title).getByRole("button", { name });
      if ((await btn.count()) === 0)
        return { ok: false, error: "priority buttons hidden (hostPriorityEnabled off)" };
      await btn.click();
      return settle();
    },
    /** Done on the current singer. autoStart is the checkbox state; pass false to untick first. */
    async done({ autoStart = true } = {}) {
      const box = page.getByRole("checkbox", { name: /auto-start|התחלה אוטומטית/i });
      if ((await box.isChecked()) !== autoStart) await box.click();
      await page
        .getByTestId("now-singing")
        .getByRole("button", { name: /^(done, next|done|סיום, הבא|סיום)$/i })
        .first()
        .click();
      return settle();
    },
    async skipSinging() {
      await page
        .getByTestId("now-singing")
        .getByRole("button", { name: /^(skip|דילוג)$/i })
        .click();
      return settle();
    },
    async closeNight() {
      page.once("dialog", (d) => void d.accept());
      await page
        .getByRole("button", { name: /^(close night|סיום הערב)$/i })
        .first()
        .click();
      return settle(1500);
    },
    async openNight() {
      await page
        .getByRole("button", { name: /^(open night|פתיחת הערב)$/i })
        .first()
        .click();
      return settle(1500);
    },
    async playerStatus() {
      const panel = page.getByTestId("player-panel");
      if ((await panel.count()) === 0) return null;
      return {
        status: await textOrNull(panel.locator("span[aria-live=polite]")),
        heading: await textOrNull(panel.locator("p.text-xl")),
        text: clean(await panel.innerText()).slice(0, 400),
      };
    },
    async errorBanner() {
      return textOrNull(alerts(page));
    },
    async session() {
      const s = await sessionFromCookies(context);
      if (!s?.access_token) return null;
      const claims = decodeJwt(s.access_token);
      return { accessToken: s.access_token, userId: claims.sub, isAnonymous: claims.is_anonymous };
    },
    async saveState(file = stateFile) {
      await context.storageState({ path: file });
      return file;
    },
    async screenshot(file) {
      await page.screenshot({ path: file, fullPage: true });
      return file;
    },
    async close() {
      await context.close();
    },
  };

  function queueRow(title) {
    return page.getByTestId("queue-row").filter({ hasText: title }).first();
  }
  function pendingRow(title) {
    return page
      .locator("section[aria-labelledby=pending-title] li")
      .filter({ hasText: title })
      .first();
  }
  async function settle(ms = 900) {
    await page.waitForTimeout(ms);
    return { error: await dj.errorBanner(), ...(await readSnapshot()) };
  }

  async function readSnapshot() {
    const nightOn = (await page.getByText(/^night is on|הערב פעיל/i).count()) > 0;
    const singingCard = page.getByTestId("now-singing");
    let nowSinging = null;
    if ((await singingCard.count()) > 0) {
      const ps = singingCard.locator("p");
      nowSinging = {
        title: clean(await ps.nth(0).innerText()),
        singers: clean(await ps.nth(1).innerText()),
      };
    }
    const pendingRows = page.locator("section[aria-labelledby=pending-title] li");
    const pending = [];
    for (let i = 0; i < (await pendingRows.count()); i++) {
      const ps = pendingRows.nth(i).locator("p");
      pending.push({
        title: clean(await ps.nth(0).innerText()),
        singers: clean(await ps.nth(1).innerText()),
      });
    }
    const rows = page.getByTestId("queue-row");
    const queue = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i);
      const ps = row.locator("p");
      const meta = clean(await ps.nth(1).innerText());
      queue.push({
        index: i + 1,
        title: clean(await ps.nth(0).innerText()),
        meta,
        table:
          (meta.match(/Table (\S+)|שולחן (\S+)/) ?? [])[1] ??
          (meta.match(/שולחן (\S+)/) ?? [])[1] ??
          null,
        pinned: /pinned|מוצמד/i.test(meta),
        priority: Number((meta.match(/Priority (\d+)|עדיפות (\d+)/) ?? [])[1] ?? 0),
      });
    }
    const historyText = await textOrNull(page.locator("details summary"));
    return { nightOn, nowSinging, pending, queue, history: historyText };
  }

  return dj;
}

// ---------------------------------------------------------------------------
// Direct Supabase calls (RLS probes) with a guest's own token
// ---------------------------------------------------------------------------
function headers(token, extra = {}) {
  return {
    apikey: SUPABASE.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token ?? SUPABASE.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** PostgREST call. rest(token, "song_requests?select=id,status&night_id=eq.<id>") or with method/body. */
export async function rest(
  token,
  pathAndQuery,
  { method = "GET", body = null, prefer = null } = {},
) {
  const res = await fetch(`${SUPABASE.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: headers(token, prefer ? { Prefer: prefer } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, data };
}

/** RPC call: rpc(token, "join_table", { p_table_id }) */
export async function rpc(token, fn, args = {}) {
  return rest(token, `rpc/${fn}`, { method: "POST", body: args });
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
