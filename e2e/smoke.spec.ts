import { test, expect } from "@playwright/test";

test("forgot password page shows reset form or setup notice", async ({ page }) => {
  await page.goto("/forgot");
  const setup = page.getByText(/supabase|configure|environment variable/i);
  const reset = page.getByRole("heading", { name: /reset your password/i });
  const appBrand = page.getByRole("heading", { name: /party planner/i });
  await expect(setup.or(reset).or(appBrand).first()).toBeVisible({ timeout: 10_000 });
  if (await reset.isVisible().catch(() => false)) {
    await expect(page.getByLabel(/email/i)).toBeVisible();
  }
});

test("loads app shell and shows sign-in, events, or setup notice", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Party Planner/i);
  const body = page.locator("body");
  const hasAuth =
    (await page.getByRole("heading", { name: /sign in|log in|welcome/i }).count()) > 0 ||
    (await page.getByText(/password|email/i).count()) > 0;
  const hasDash = (await page.getByText(/your events|new event/i).count()) > 0;
  const hasSetup = (await page.getByText(/supabase|configure|environment variable/i).count()) > 0;
  expect(hasAuth || hasDash || hasSetup).toBeTruthy();
  await expect(body).toBeVisible();
});

test.describe("with E2E credentials", () => {
  // Read env after config has merged .env.local (see playwright.config.ts).
  test.skip(
    !(process.env.E2E_EMAIL && process.env.E2E_PASSWORD),
    "add E2E_EMAIL and E2E_PASSWORD to the environment or .env.local (loaded by Playwright config)"
  );

  test.beforeEach(async ({ page }) => {
    const email = process.env.E2E_EMAIL!;
    const password = process.env.E2E_PASSWORD!;
    await page.goto("/");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).first().fill(password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible({ timeout: 25_000 });
  });

  test("reaches the dashboard (authenticated)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible();
  });

  test("creates a blank event from the dashboard", async ({ page }) => {
    const stamp = `E2E ${Date.now()}`;
    await page.getByRole("button", { name: /new event/i }).first().click();
    await page.getByRole("button", { name: /blank event/i }).click();
    await page.getByLabel(/event name/i).fill(stamp);
    await page.getByRole("button", { name: /create event/i }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+$/i, { timeout: 25_000 });
    await expect(page.getByRole("heading", { name: stamp, level: 1 })).toBeVisible();
  });

  test("event settings route shows team heading", async ({ page }) => {
    const stamp = `E2E team ${Date.now()}`;
    await page.getByRole("button", { name: /new event/i }).first().click();
    await page.getByRole("button", { name: /blank event/i }).click();
    await page.getByLabel(/event name/i).fill(stamp);
    await page.getByRole("button", { name: /create event/i }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]+$/i, { timeout: 25_000 });
    await page.getByRole("link", { name: /settings/i }).first().click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: /settings & team/i })).toBeVisible();
  });
});
