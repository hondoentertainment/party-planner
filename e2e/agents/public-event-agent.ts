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

  /** Asserts the social-proof chip is visible with the given going count (only renders when count ≥ 3). */
  async expectGoingSocialProof(count: number) {
    await expect(this.page.getByText(new RegExp(`${count}\\s*going`, "i"))).toBeVisible();
  }

  /** Asserts the social-proof chip is NOT visible (small parties). */
  async expectNoSocialProofChip() {
    await expect(this.page.getByText(/\d+\s*going/i)).toHaveCount(0);
  }

  /** Asserts the inline Yes/Maybe/No segmented control is the primary CTA above the fold. */
  async expectRsvpSegmentedControl() {
    await expect(this.page.getByRole("radiogroup", { name: /rsvp response/i })).toBeVisible();
    await expect(this.page.getByRole("radio", { name: /i'm in/i })).toBeVisible();
    await expect(this.page.getByRole("radio", { name: /maybe/i })).toBeVisible();
    await expect(this.page.getByRole("radio", { name: /can't make it/i })).toBeVisible();
  }

  /**
   * Asserts the single "Add to calendar" dropdown trigger replaced the old
   * dual buttons (Item 10). The trigger is a `<summary>` inside `<details>`,
   * which Chromium maps to a disclosure widget; assert by visible text to
   * avoid role ambiguity across browsers.
   */
  async expectAddToCalendarDropdown() {
    await expect(this.page.getByText(/add to calendar/i).first()).toBeVisible();
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
