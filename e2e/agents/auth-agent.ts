import { expect, type Page } from "@playwright/test";
import type { E2ECredentials } from "./test-env";

export class AuthAgent {
  constructor(private readonly page: Page) {}

  async signIn(credentials: E2ECredentials) {
    await this.page.goto("/");
    const dashboard = this.page.getByRole("heading", { name: /your events/i });
    const emailInput = this.page.getByLabel(/email/i);
    const setupNotice = this.page.getByText(/supabase|configure|environment variable/i);

    await expect(dashboard.or(emailInput).or(setupNotice).first()).toBeVisible({ timeout: 25_000 });

    if (await dashboard.isVisible().catch(() => false)) return;
    if (await setupNotice.isVisible().catch(() => false)) {
      throw new Error("Supabase is not configured for authenticated E2E tests.");
    }

    await emailInput.fill(credentials.email);
    await this.page.getByLabel(/password/i).first().fill(credentials.password);
    await this.page.getByRole("button", { name: /sign in|log in/i }).click();
    await this.expectDashboard();
  }

  async expectDashboard() {
    await expect(this.page.getByRole("heading", { name: /your events/i })).toBeVisible({
      timeout: 25_000,
    });
  }

  async signOut() {
    await this.page.getByRole("button", { name: /sign out/i }).click();
    await expect(this.page.getByLabel(/email/i)).toBeVisible({ timeout: 10_000 });
  }
}
