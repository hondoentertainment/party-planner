import { expect, test } from "./test-fixture";
import { AuthAgent } from "./agents/auth-agent";
import { getE2ECredentials } from "./agents/test-env";

const credentials = getE2ECredentials();

// Item 24 — single, centered, dismissible onboarding tour gated by the
// `onboarding-completed-v1` localStorage flag. The Dashboard mounts it ~400ms
// after first paint when the flag is missing.
const ONBOARDING_KEY = "onboarding-completed-v1";

test.describe("with E2E credentials — onboarding tour", () => {
  test.skip(
    !credentials,
    "add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, and E2E_PASSWORD to run signed-in E2E tests"
  );

  test.beforeEach(async ({ page }) => {
    await new AuthAgent(page).signIn(credentials!);
    // Reset the flag so each test sees a "first visit". We do this AFTER
    // signing in so we're on the same origin Playwright can write to.
    await page.evaluate((key) => window.localStorage.removeItem(key), ONBOARDING_KEY);
  });

  test("auto-opens a centered modal with progress dots and welcome copy", async ({ page }) => {
    // Reload so the Dashboard re-runs its first-paint check with no flag.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible({
      timeout: 25_000,
    });

    const tour = page.getByRole("dialog").filter({ hasText: /welcome to party planner/i });
    await expect(tour).toBeVisible({ timeout: 5_000 });

    await expect(
      tour.getByRole("heading", { name: /welcome to party planner/i })
    ).toBeVisible();

    await expect(
      tour.getByRole("button", { name: /show me around/i })
    ).toBeVisible();

    // Progress dots — 4 step buttons rendered as `<button aria-label="Go to step N of 4">`.
    await expect(
      tour.getByRole("button", { name: /go to step 1 of 4/i })
    ).toBeVisible();
    await expect(
      tour.getByRole("button", { name: /go to step 4 of 4/i })
    ).toBeVisible();

    // Skip link is present and exits without throwing.
    await expect(
      tour.getByRole("button", { name: /skip tour/i })
    ).toBeVisible();
  });

  test("clicking Skip persists the completed flag (no re-open on next visit)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible({
      timeout: 25_000,
    });

    const tour = page.getByRole("dialog").filter({ hasText: /welcome to party planner/i });
    await expect(tour).toBeVisible({ timeout: 5_000 });

    await tour.getByRole("button", { name: /skip tour/i }).click();
    await expect(tour).toBeHidden();

    // Persisted to localStorage (same key the production code writes).
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), ONBOARDING_KEY);
    expect(stored).toBe("1");

    // Reloading should NOT re-open the tour.
    await page.reload();
    await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(
      page.getByRole("dialog").filter({ hasText: /welcome to party planner/i })
    ).toHaveCount(0);
  });

  test("Esc closes the tour without persisting (re-opens next visit)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible({
      timeout: 25_000,
    });

    const tour = page.getByRole("dialog").filter({ hasText: /welcome to party planner/i });
    await expect(tour).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
    await expect(tour).toBeHidden();

    // Esc closes WITHOUT marking complete (per OnboardingTour.tsx skip vs Esc
    // distinction). Storage should still be empty.
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), ONBOARDING_KEY);
    expect(stored).toBeNull();
  });
});
