import { expect, type Page } from "@playwright/test";

export class AppAgent {
  constructor(private readonly page: Page) {}

  async gotoHome() {
    await this.page.goto("/");
  }

  async gotoForgotPassword() {
    await this.page.goto("/forgot");
  }

  async expectDocumentReady() {
    await expect(this.page).toHaveTitle(/Party Planner/i);
    await expect(this.page.locator("body")).toBeVisible();
  }

  async expectLandingState() {
    await this.expectDocumentReady();
    await expect(
      this.page
        .getByText(/loading/i)
        .or(this.page.getByRole("heading", { name: /sign in|log in|welcome/i }))
        .or(this.page.getByText(/password|email/i))
        .or(this.page.getByText(/your events|new event/i))
        .or(this.page.getByRole("heading", { name: /almost ready to party/i }))
        .or(this.page.getByText(/supabase|configure|environment variable/i))
        .first()
    ).toBeVisible({ timeout: 10_000 });
  }

  async expectForgotPasswordState() {
    const setup = this.page.getByText(/supabase|configure|environment variable/i);
    const reset = this.page.getByRole("heading", { name: /reset your password/i });
    const brand = this.page.getByRole("heading", { name: /party planner/i });
    const setupHeading = this.page.getByRole("heading", { name: /almost ready to party/i });

    await expect(setup.or(reset).or(brand).or(setupHeading).first()).toBeVisible({ timeout: 10_000 });
    if (await reset.isVisible().catch(() => false)) {
      await expect(this.page.getByLabel(/email/i)).toBeVisible();
    }
  }
}
