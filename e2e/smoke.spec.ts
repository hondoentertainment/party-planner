import { test, expect } from "@playwright/test";

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
  test("signs in and reaches the dashboard", async ({ page }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    if (!email || !password) {
      test.skip();
      return;
    }
    await page.goto("/");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).first().fill(password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible({ timeout: 25_000 });
  });
});
