import { expect, type Page } from "@playwright/test";

export class PublicEventAgent {
  constructor(private readonly page: Page) {}

  async open(publicUrl: string) {
    await this.page.goto(publicUrl);
  }

  async expectEventDetails(name: string, options: { location?: string; theme?: string } = {}) {
    await expect(this.page.getByRole("heading", { name, level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    if (options.location) {
      await expect(this.page.getByText(options.location)).toBeVisible();
      await expect(this.page.getByRole("link", { name: /directions/i })).toBeVisible();
    }
    if (options.theme) {
      await expect(this.page.getByText(options.theme)).toBeVisible();
    }
  }

  async expectRsvpSummary(label: "Going" | "Maybe" | "Pending" | "Not going", count: number) {
    const card = this.page.locator(".card", { hasText: label }).filter({ hasText: String(count) });

    await expect(card.first()).toBeVisible();
  }

  async expectScheduleItem(title: string) {
    await expect(this.page.getByText(title)).toBeVisible();
  }

  async expectMenuItem(title: string) {
    await expect(this.page.getByText(title)).toBeVisible();
  }

  async expectDrinkItem(title: string) {
    await expect(this.page.getByText(title)).toBeVisible();
  }

  async expectMusicItem(title: string) {
    await expect(this.page.getByText(title)).toBeVisible();
  }

  async expectPublicSection(name: string) {
    await expect(this.page.getByRole("heading", { name: new RegExp(name, "i") })).toBeVisible();
  }
}
