import { expect, type Page } from "@playwright/test";

interface BlankEventOptions {
  location?: string;
  startsAt?: string;
  theme?: string;
}

export class EventAgent {
  constructor(private readonly page: Page) {}

  async createBlankEvent(name: string, options: BlankEventOptions = {}) {
    await this.page.getByRole("button", { name: /new event/i }).first().click();
    await this.page.getByRole("button", { name: /blank event/i }).click();
    await this.page.getByLabel(/event name/i).fill(name);

    if (options.location) {
      await this.page.getByLabel(/location/i).fill(options.location);
    }
    if (options.startsAt) {
      await this.page.getByLabel(/date & time/i).fill(options.startsAt);
    }
    if (options.theme) {
      await this.page.getByLabel(/theme/i).fill(options.theme);
    }

    await this.page.getByRole("button", { name: /create event/i }).click();
    await expect(this.page).toHaveURL(/\/events\/[0-9a-f-]+$/i, { timeout: 25_000 });
    await expect(this.page.getByRole("heading", { name, level: 1 })).toBeVisible();

    return this.currentEventId();
  }

  async openSection(label: string) {
    await this.page.getByRole("link", { name: new RegExp(`^${escapeRegExp(label)}$`, "i") }).first().click();
  }

  async openSettings() {
    await this.openSection("Settings");
    await expect(this.page).toHaveURL(/\/settings$/);
    await expect(this.page.getByRole("heading", { name: /settings & team/i })).toBeVisible();
  }

  async openTimeline() {
    await this.openSection("Timeline");
    await expect(this.page.getByRole("heading", { name: /^Timeline$/i })).toBeVisible();
  }

  async openGuests() {
    await this.openSection("Guests");
    await expect(this.page.getByRole("heading", { name: /guest list/i })).toBeVisible();
  }

  async openFood() {
    await this.openSection("Food");
    await expect(this.page.getByRole("heading", { name: /food & menu/i })).toBeVisible();
  }

  async openShopping() {
    await this.openSection("Food Purchasing");
    await expect(this.page.getByRole("heading", { name: /food purchasing/i })).toBeVisible();
  }

  async openBudget() {
    await this.openSection("Budget");
    await expect(this.page.getByRole("heading", { name: /^Budget$/i })).toBeVisible();
  }

  async openVendors() {
    await this.openSection("Vendors");
    await expect(this.page.getByRole("heading", { name: /vendors & contacts/i })).toBeVisible();
  }

  async openWrapUp() {
    await this.openSection("Wrap-up");
    await expect(this.page.getByRole("heading", { name: /post-event wrap-up/i })).toBeVisible();
  }

  async openCalendar() {
    await this.page.getByRole("link", { name: /^Calendar$/i }).click();
    await expect(this.page.getByRole("heading", { name: /^Calendar$/i })).toBeVisible();
  }

  async addStarterTasks() {
    await this.page.getByRole("button", { name: /add starter tasks/i }).first().click();
    await expect(this.page.locator('input[value="Confirm guest list"]')).toBeVisible({
      timeout: 15_000,
    });
  }

  async assignFirstTaskTo(displayName: string) {
    await this.page.getByRole("button", { name: "Assign task" }).first().click();
    await this.page.getByRole("button", { name: new RegExp(escapeRegExp(displayName), "i") }).click();
    await expect(
      this.page.getByRole("button", { name: new RegExp(`Assigned to ${escapeRegExp(displayName)}`, "i") }).first()
    ).toBeVisible({ timeout: 15_000 });
  }

  async addGuest(name: string) {
    const form = this.page.locator("form", { has: this.page.getByPlaceholder(/add guest name/i) });

    await form.getByPlaceholder(/add guest name/i).fill(name);
    await form.getByRole("button", { name: /^Add$/i }).click();
    await expect(this.page.getByDisplayValue(name)).toBeVisible({ timeout: 15_000 });
  }

  async importGuests(csvRows: string, expectedNewGuests: number) {
    await this.page.getByRole("button", { name: /paste from partiful/i }).click();

    const dialog = this.page.getByRole("dialog", { name: /paste from partiful/i });
    await dialog.locator("textarea").fill(csvRows);
    await expect(dialog.getByText(new RegExp(`${expectedNewGuests} new guests? detected`, "i"))).toBeVisible();
    await dialog.getByRole("button", { name: new RegExp(`Import ${expectedNewGuests}`, "i") }).click();
  }

  async markGuestGoing(name: string) {
    const row = this.rowContainingValue(name);

    await row.getByRole("button", { name: /mark as going/i }).click();
    await expect(row.getByRole("button", { name: /mark as going/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  }

  async setGuestPlusOnes(name: string, count: number) {
    const row = this.rowContainingValue(name);

    await row.getByRole("button", { name: /more/i }).click();
    await row.getByLabel(/bringing guests/i).check();
    await row.locator('input[type="number"]').fill(String(count));
    await expect(row.getByText(`+${count}`)).toBeVisible({ timeout: 15_000 });
  }

  async expectHeadsToFeed(count: number) {
    await expect(this.page.locator(".card", { hasText: "Heads to feed" }).getByText(String(count))).toBeVisible();
  }

  async addFoodItem(title: string, courseLabel = "Mains") {
    const form = this.page.locator("form", { has: this.page.getByPlaceholder(/pulled pork sliders/i) });

    await form.locator("select").selectOption({ label: courseLabel });
    await form.getByPlaceholder(/pulled pork sliders/i).fill(title);
    await form.getByRole("button", { name: /^Add$/i }).click();
    await expect(this.page.getByDisplayValue(title)).toBeVisible({ timeout: 15_000 });
  }

  async setFoodServings(title: string, servings: number) {
    const row = this.rowContainingValue(title);

    await row.locator('input[type="number"]').fill(String(servings));
    await expect(this.page.getByText(new RegExp(`${servings} total servings`, "i"))).toBeVisible({
      timeout: 15_000,
    });
  }

  async expectMenuServingGuidance(confirmedGuests: number, totalServings: number, shortfall: number) {
    await expect(
      this.page.getByText(
        new RegExp(
          `Guest list:\\s*${confirmedGuests}\\s*confirmed to attend.*covers\\s*${totalServings}\\s*servings`,
          "i"
        )
      )
    ).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByText(new RegExp(`Consider adding\\s*${shortfall}\\s*more`, "i"))).toBeVisible();
  }

  async addShoppingItem(title: string, storeLabel = "Costco") {
    const form = this.page.locator("form", { has: this.page.getByPlaceholder(/burger buns/i) });

    await form.locator("select").selectOption({ label: storeLabel });
    await form.getByPlaceholder(/burger buns/i).fill(title);
    await form.getByRole("button", { name: /^Add$/i }).click();
    await expect(this.page.getByDisplayValue(title)).toBeVisible({ timeout: 15_000 });
  }

  async setShoppingEstimate(title: string, amount: string) {
    const row = this.rowContainingValue(title);

    await row.getByPlaceholder(/est\. \$/i).fill(amount);
    await expect(this.page.getByText(new RegExp(`Est\\.\\s*\\$${escapeRegExp(amount)}`, "i"))).toBeVisible({
      timeout: 15_000,
    });
  }

  async markShoppingItemPurchased(title: string, actualAmount: string) {
    const row = this.rowContainingValue(title);

    await row.getByPlaceholder(/actual \$/i).fill(actualAmount);
    await row.getByRole("button", { name: /mark as purchased/i }).click();
    await expect(row.getByRole("button", { name: /mark as to buy/i })).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByText(new RegExp(`Spent\\s*\\$${escapeRegExp(actualAmount)}`, "i"))).toBeVisible();
  }

  async addBudgetItem(label: string, estimated: string, actual: string) {
    await this.page.getByLabel("Item").fill(label);
    await this.page.getByLabel("Estimated").fill(estimated);
    await this.page.getByLabel("Actual").fill(actual);
    await this.page.getByRole("button", { name: /add budget item/i }).click();
    await expect(this.page.getByText(label)).toBeVisible({ timeout: 15_000 });
  }

  async addVendor(name: string, phone: string) {
    await this.page.getByLabel("Vendor").fill(name);
    await this.page.getByLabel("Phone").fill(phone);
    await this.page.getByRole("button", { name: /^Add$/ }).click();
    await expect(this.page.getByText(name)).toBeVisible({ timeout: 15_000 });
  }

  async saveWrapUp(summary: string, actualGuests: string) {
    await this.page.getByLabel("What worked?").fill(summary);
    await this.page.getByLabel("Actual guests").fill(actualGuests);
    await this.page.getByRole("button", { name: /save wrap-up/i }).click();
    await expect(this.page.getByText(/wrap-up saved/i)).toBeVisible({ timeout: 15_000 });
  }

  async createPublicShareLink() {
    await this.openSettings();
    await this.page.getByRole("button", { name: /create public link/i }).click();
    const publicLink = this.page.getByText(/\/s\/[A-Za-z0-9_-]+/).first();
    await expect(publicLink).toBeVisible({ timeout: 15_000 });
    return (await publicLink.textContent())?.trim() ?? "";
  }

  async expectCalendarEvent(name: string) {
    await expect(this.page.getByRole("link", { name: new RegExp(escapeRegExp(name), "i") }).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  private currentEventId() {
    const match = this.page.url().match(/\/events\/([0-9a-f-]+)/i);
    return match?.[1] ?? null;
  }

  private rowContainingValue(value: string) {
    return this.page.locator(".card", { has: this.page.getByDisplayValue(value) }).first();
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
