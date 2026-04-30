import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Reusable selectors and helpers for the post-event Wrap-up form
 * (`src/modules/WrapUpModule.tsx`). Prefers `getByLabel` / `getByRole` so the
 * tests double as accessibility-name regression checks.
 */
export class WrapUpAgent {
  constructor(private readonly page: Page) {}

  heading(): Locator {
    return this.page.getByRole("heading", { name: /post-event wrap-up/i });
  }

  summaryField(): Locator {
    return this.page.getByLabel(/what worked\?/i);
  }

  lessonsField(): Locator {
    return this.page.getByLabel(/lessons for next time/i);
  }

  finalCostField(): Locator {
    return this.page.getByLabel(/final cost/i);
  }

  guestCountField(): Locator {
    return this.page.getByLabel(/actual guests/i);
  }

  vendorRatingField(): Locator {
    return this.page.getByLabel(/vendor rating/i);
  }

  saveButton(): Locator {
    return this.page.getByRole("button", { name: /save wrap-up/i });
  }

  async expectVisible() {
    await expect(this.heading()).toBeVisible({ timeout: 15_000 });
  }

  async fill({ summary, lessons }: { summary?: string; lessons?: string }) {
    if (summary !== undefined) {
      await this.summaryField().fill(summary);
    }
    if (lessons !== undefined) {
      await this.lessonsField().fill(lessons);
    }
  }

  async save() {
    await this.saveButton().click();
    await expect(this.page.getByText(/wrap-up saved/i)).toBeVisible({ timeout: 15_000 });
  }

  async expectValues({ summary, lessons }: { summary?: string; lessons?: string }) {
    if (summary !== undefined) {
      await expect(this.summaryField()).toHaveValue(summary);
    }
    if (lessons !== undefined) {
      await expect(this.lessonsField()).toHaveValue(lessons);
    }
  }

  async clear() {
    await this.summaryField().fill("");
    await this.lessonsField().fill("");
  }
}
