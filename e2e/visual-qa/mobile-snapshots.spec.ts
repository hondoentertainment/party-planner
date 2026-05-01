import { test, expect, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, "screenshots");

const screenshotPath = (name: string) => path.join(SHOTS_DIR, `${name}.png`);

const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;
const HAS_CREDENTIALS = Boolean(E2E_EMAIL && E2E_PASSWORD);
const SUPABASE_CONFIGURED = Boolean(
  process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
);

// All captures use the iPhone 14 Pro viewport for consistency.
// Strip `defaultBrowserType` so we run on the configured chromium project
// instead of trying to launch WebKit (which isn't installed locally).
const { defaultBrowserType: _ignoredBrowserType, ...iPhone14Pro } = devices["iPhone 14 Pro"];
void _ignoredBrowserType;
test.use({ ...iPhone14Pro });

async function isSetupNoticeVisible(page: import("@playwright/test").Page) {
  return page
    .getByRole("heading", { name: /almost ready to party/i })
    .isVisible()
    .catch(() => false);
}

async function signIn(page: import("@playwright/test").Page) {
  if (!HAS_CREDENTIALS) return false;
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  // If already signed in, the dashboard shows.
  const dashboardMarker = page.getByRole("button", { name: /new event|create event/i });
  const signInLink = page.getByRole("button", { name: /^sign in$/i });
  if (await dashboardMarker.first().isVisible().catch(() => false)) {
    return true;
  }
  // Auth page may default to sign-up; click the "Sign in" toggle if available.
  if (await signInLink.first().isVisible().catch(() => false)) {
    await signInLink.first().click();
  }
  await page.getByLabel(/email/i).fill(E2E_EMAIL!);
  await page.getByLabel(/password/i).fill(E2E_PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  return await dashboardMarker.first().isVisible().catch(() => false);
}

test.describe("Mobile visual QA — iPhone 14 Pro", () => {
  test("01 — auth page (sign-up default state)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    if (await isSetupNoticeVisible(page)) {
      test.skip(true, "SetupNotice is shown — Supabase env vars missing in build.");
      return;
    }

    // Wait for the redesigned hero copy to render.
    await expect(
      page.getByRole("heading", { name: /create your account|welcome back/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Sanity check on the redesigned CTA copy when in signup mode.
    await expect(
      page.getByRole("button", { name: /start planning.*free|create account|sign up/i }).first()
    ).toBeVisible();

    await page.screenshot({ path: screenshotPath("01-auth-page-mobile"), fullPage: true });
  });

  test("02 — public share-link unavailable hero", async ({ page }) => {
    await page.goto("/s/-");
    await page.waitForLoadState("domcontentloaded");

    if (await isSetupNoticeVisible(page)) {
      test.skip(true, "SetupNotice is shown — Supabase env vars missing in build.");
      return;
    }

    // Either "Share link unavailable" (rpc returned null) or
    // "Could not load share link" (rpc errored). Both are acceptable
    // empty states for the redesigned hero.
    const heading = page
      .getByRole("heading", { name: /share link unavailable|could not load share link/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /go to party planner/i })).toBeVisible();

    await page.screenshot({ path: screenshotPath("02-public-share-unavailable-mobile"), fullPage: true });
  });

  test("03 — onboarding tour modal", async ({ page }) => {
    test.skip(!HAS_CREDENTIALS, "Auth-gated: requires E2E_EMAIL/E2E_PASSWORD.");
    test.skip(!SUPABASE_CONFIGURED, "Auth-gated: requires real VITE_SUPABASE_* env.");

    // Force the tour to auto-open: clear the canonical "completed" flag.
    // The production key lives in `src/lib/onboarding.ts` as
    // `onboarding-completed-v1`. Older guesses are kept for backwards-compat.
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("onboarding-completed-v1");
        window.localStorage.removeItem("onboardingCompleted");
        window.localStorage.removeItem("onboarding:completed");
      } catch {
        /* ignore privacy-mode / quota errors */
      }
    });

    const signedIn = await signIn(page);
    test.skip(!signedIn, "Could not sign in with provided credentials.");

    // The tour opens after ~400ms.
    const heading = page.getByRole("heading", { name: /welcome to party planner/i });
    await expect(heading).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /show me around/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /skip tour/i })).toBeVisible();

    await page.screenshot({ path: screenshotPath("03-onboarding-tour-mobile"), fullPage: true });
  });

  test("04 — mobile bottom-sheet account menu", async ({ page }) => {
    test.skip(!HAS_CREDENTIALS, "Auth-gated: requires E2E_EMAIL/E2E_PASSWORD.");
    test.skip(!SUPABASE_CONFIGURED, "Auth-gated: requires real VITE_SUPABASE_* env.");

    // Suppress the onboarding tour so the avatar is the focus.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("onboarding-completed-v1", "1");
      } catch {
        /* ignore privacy-mode / quota errors */
      }
    });

    const signedIn = await signIn(page);
    test.skip(!signedIn, "Could not sign in with provided credentials.");

    // Tap the gradient avatar trigger (mobile-only header button).
    const avatar = page.getByRole("button", { name: /open account menu|account/i }).first();
    await expect(avatar).toBeVisible({ timeout: 5_000 });
    await avatar.click();

    await expect(page.getByRole("dialog").or(page.getByText(/sign out/i)).first()).toBeVisible();
    // Allow the slide-up transition to settle.
    await page.waitForTimeout(350);

    await page.screenshot({ path: screenshotPath("04-mobile-account-menu"), fullPage: true });
  });

  test("05 — two-row event nav (mobile More sheet)", async ({ page }) => {
    test.skip(!HAS_CREDENTIALS, "Auth-gated: requires E2E_EMAIL/E2E_PASSWORD.");
    test.skip(!SUPABASE_CONFIGURED, "Auth-gated: requires real VITE_SUPABASE_* env.");

    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("onboarding-completed-v1", "1");
      } catch {
        /* ignore privacy-mode / quota errors */
      }
    });

    const signedIn = await signIn(page);
    test.skip(!signedIn, "Could not sign in with provided credentials.");

    // Open the first event card on the dashboard.
    const eventCard = page.getByRole("link", { name: /open event|view event|details/i }).first();
    if (!(await eventCard.isVisible().catch(() => false))) {
      // Fallback — pick the first link inside an event card list.
      const fallback = page.locator("a[href^='/events/']").first();
      test.skip(!(await fallback.isVisible().catch(() => false)), "No events available on dashboard.");
      await fallback.click();
    } else {
      await eventCard.click();
    }
    await page.waitForLoadState("networkidle").catch(() => {});

    // Tap the bottom-nav "More" tab.
    const moreTab = page.getByRole("button", { name: /^more$/i }).first();
    await expect(moreTab).toBeVisible({ timeout: 5_000 });
    await moreTab.click();

    await expect(page.getByText(/all sections/i).first()).toBeVisible();
    await page.waitForTimeout(300);

    await page.screenshot({ path: screenshotPath("05-event-more-sheet-mobile"), fullPage: true });
  });
});
