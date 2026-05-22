import { expect, type Page } from "@playwright/test";

interface BlankEventOptions {
  location?: string;
  /**
   * Local date+time string in `YYYY-MM-DDTHH:mm` format. Will be split across
   * the new dialog's separate Date / Start time inputs (see Item 16 — date
   * picker disclosure).
   */
  startsAt?: string;
  theme?: string;
}

/** Event tab labels → URL segments (matches `src/pages/eventPageTabs.ts`). */
const SECTION_PATHS: Record<string, string> = {
  Overview: "",
  Timeline: "timeline",
  Guests: "guests",
  Menu: "food",
  Beverages: "beverages",
  Shopping: "shopping",
  Budget: "budget",
  Vendors: "vendors",
  Logistics: "logistics",
  Signs: "signs",
  Games: "games",
  Music: "music",
  Restrooms: "restrooms",
  Decorations: "decorations",
  "Day-of setup": "setup",
  "Post-party": "wrap-up",
  Settings: "settings",
};

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
      const { date, time } = splitLocalDateTime(options.startsAt);
      if (date) await this.page.getByLabel(/^Date$/i).fill(date);
      if (time) await this.page.getByLabel(/start time/i).fill(time);
    }
    if (options.theme) {
      const more = this.page.getByRole("button", { name: /more options/i });
      if (await more.isVisible().catch(() => false)) {
        await more.click();
      }
      await this.page.getByLabel(/theme/i).fill(options.theme);
    }

    await this.page.getByRole("button", { name: /create event/i }).click();
    await expect(this.page).toHaveURL(/\/events\/[0-9a-f-]+$/i, { timeout: 25_000 });
    await expect(this.page.getByRole("heading", { name, level: 1 })).toBeVisible();

    return this.currentEventId();
  }

  /** Navigate by URL — reliable across desktop group nav and mobile bottom bar. */
  async openSection(label: string) {
    const eventId = this.currentEventId();
    if (!eventId) throw new Error("openSection requires an active event page URL");
    const segment = SECTION_PATHS[label];
    if (segment === undefined) throw new Error(`Unknown event section label: ${label}`);
    const path = segment ? `/events/${eventId}/${segment}` : `/events/${eventId}`;
    await this.page.goto(path);
    await expect(this.page).toHaveURL(new RegExp(`${escapeRegExp(path)}(?:\\?|$)`, "i"));
  }

  async openMobileMoreSection(label: string) {
    await this.page.getByRole("button", { name: /more sections/i }).click();
    await expect(this.page.getByRole("dialog", { name: /all sections/i })).toBeVisible();
    await this.page.getByRole("link", { name: new RegExp(`^${escapeRegExp(label)}$`, "i") }).click();
    await expect(this.page.getByRole("dialog", { name: /all sections/i })).toBeHidden();
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
    await this.openSection("Menu");
    await expect(this.page.getByRole("heading", { name: /food & menu/i })).toBeVisible();
  }

  async openShopping() {
    await this.openSection("Shopping");
    await expect(this.page.getByRole("heading", { name: /food purchasing/i })).toBeVisible();
  }

  async openBeverages() {
    await this.openSection("Beverages");
    await expect(this.page.getByRole("heading", { name: /^Beverages$/i })).toBeVisible();
  }

  async openMusic() {
    await this.openSection("Music");
    await expect(this.page.getByRole("heading", { name: /^Music$/i })).toBeVisible();
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
    await this.openSection("Post-party");
    await expect(this.page.getByRole("heading", { name: /post-event wrap-up/i })).toBeVisible();
  }

  async openCalendar() {
    await this.page.getByRole("link", { name: /^Calendar$/i }).click();
    await expect(this.page.getByRole("heading", { name: /^Calendar$/i })).toBeVisible();
  }

  async openDashboard() {
    await this.page.getByRole("link", { name: /all events/i }).click();
    await expect(this.page.getByRole("heading", { name: /your events/i })).toBeVisible();
  }

  async addStarterTasks() {
    await this.page.getByRole("button", { name: /add starter tasks/i }).first().click();
    await expect(
      this.page.getByRole("textbox", { name: /title for confirm guest list/i })
    ).toBeVisible({ timeout: 15_000 });
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
    await expect(
      this.page.getByRole("textbox", { name: new RegExp(`Guest name for ${escapeRegExp(name)}`, "i") })
    ).toBeVisible({ timeout: 15_000 });
  }

  async importGuests(csvRows: string, expectedNewGuests: number) {
    await this.page.getByRole("button", { name: /paste from partiful/i }).click();

    const dialog = this.page.getByRole("dialog", { name: /paste from partiful/i });
    await dialog.locator("textarea").fill(csvRows);
    await expect(dialog.getByText(new RegExp(`${expectedNewGuests} new guests? detected`, "i"))).toBeVisible();
    await dialog.getByRole("button", { name: new RegExp(`Import ${expectedNewGuests}`, "i") }).click();
  }

  async markGuestGoing(name: string) {
    const row = await this.findRowContainingValue(name);

    await row.getByRole("button", { name: /mark as going/i }).click();
    await expect(row.getByRole("button", { name: /mark as going/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  }

  async setGuestPlusOnes(name: string, count: number) {
    const row = await this.findRowContainingValue(name);

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
    await expectVisibleInputValue(this.page, title);
  }

  async setFoodServings(title: string, servings: number) {
    const row = await this.findRowContainingValue(title);

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
    await expectVisibleInputValue(this.page, title);
  }

  async setShoppingEstimate(title: string, amount: string) {
    const row = await this.findRowContainingValue(title);

    await row.getByPlaceholder(/est\. \$/i).fill(amount);
    await expect(this.page.getByText(new RegExp(`Est\\.\\s*\\$${escapeRegExp(amount)}`, "i"))).toBeVisible({
      timeout: 15_000,
    });
  }

  async markShoppingItemPurchased(title: string, actualAmount: string) {
    const row = await this.findRowContainingValue(title);

    await row.getByPlaceholder(/actual \$/i).fill(actualAmount);
    await row.getByRole("button", { name: /mark as purchased/i }).click();
    await expect(row.getByRole("button", { name: /mark as to buy/i })).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByText(new RegExp(`Spent\\s*\\$${escapeRegExp(actualAmount)}`, "i"))).toBeVisible();
  }

  async addBeverage(title: string, typeLabel = "Non-alcoholic") {
    const form = this.page.locator("form", { has: this.page.getByPlaceholder(/margaritas/i) });

    await form.locator("select").selectOption({ label: typeLabel });
    await form.getByPlaceholder(/margaritas/i).fill(title);
    await form.getByRole("button", { name: /^Add$/i }).click();
    await expectVisibleInputValue(this.page, title);
  }

  async updateBeverageQuantity(title: string, quantity: string, unit: string) {
    const row = await this.findRowContainingValue(title);

    await row.locator('input[type="number"]').fill(quantity);
    await row.getByPlaceholder(/unit/i).fill(unit);
    await expect(row.locator('input[type="number"]')).toHaveValue(quantity);
    await expect(row.getByPlaceholder(/unit/i)).toHaveValue(unit);
  }

  async addMusicTrack(title: string, artist: string, setLabel = "Main set") {
    const form = this.page.locator("form", { has: this.page.getByPlaceholder(/track title/i) });

    await form.getByPlaceholder(/track title/i).fill(title);
    await form.getByPlaceholder(/artist/i).fill(artist);
    await form.locator("select").selectOption({ label: setLabel });
    await form.getByRole("button", { name: /^Add$/i }).click();
    await expectVisibleInputValue(this.page, title);
    await expectVisibleInputValue(this.page, artist);
  }

  async addPlaylist(name: string, url: string) {
    let dialogIndex = 0;
    const answers = [name, url];
    const onDialog = async (dialog: import("@playwright/test").Dialog) => {
      await dialog.accept(answers[dialogIndex++] ?? "");
    };

    this.page.on("dialog", onDialog);
    await this.page.getByRole("button", { name: /add playlist/i }).click();
    try {
      await expect(this.page.getByText(name)).toBeVisible({ timeout: 15_000 });
    } finally {
      this.page.off("dialog", onDialog);
    }
  }

  async addChecklistItem(sectionLabel: string, title: string) {
    await this.openSection(sectionLabel);
    const form = this.page.locator("form", { has: this.page.getByRole("button", { name: /^Add$/i }) }).first();

    await form.locator("input").first().fill(title);
    await form.getByRole("button", { name: /^Add$/i }).click();
    await expect(
      this.page.getByRole("textbox", { name: new RegExp(`Title for ${escapeRegExp(title)}`, "i") })
    ).toBeVisible({ timeout: 15_000 });
  }

  async expandChecklistItem(title: string) {
    const row = await this.findRowContainingValue(title);

    await row.getByRole("button", { name: /more/i }).click();
    await expect(row.getByRole("button", { name: /hide/i })).toBeVisible();
  }

  async fillChecklistDetail(title: string, label: string, value: string) {
    const row = await this.findRowContainingValue(title);
    const field = row.getByLabel(new RegExp(escapeRegExp(label), "i"));

    await field.fill(value);
    await expect(field).toHaveValue(value);
  }

  async addBudgetItem(label: string, estimated: string, actual: string) {
    await this.page.getByRole("textbox", { name: "Item" }).fill(label);
    await this.page.getByRole("textbox", { name: "Estimated" }).fill(estimated);
    await this.page.getByRole("textbox", { name: "Actual" }).fill(actual);
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

  async editEventDetails(next: { name: string; location?: string; theme?: string; startsAt?: string }) {
    await this.openSection("Overview");
    await this.page.getByRole("button", { name: /^Edit$/i }).click();
    const dialog = this.page.getByRole("dialog", { name: /edit event/i });

    await dialog.getByLabel(/event name/i).fill(next.name);
    if (next.location !== undefined) {
      await dialog.getByLabel(/location/i).fill(next.location);
    }
    if (next.theme !== undefined) {
      await dialog.getByLabel(/^theme$/i).fill(next.theme);
    }
    if (next.startsAt !== undefined) {
      await dialog.getByLabel(/date & time/i).fill(next.startsAt);
    }
    await dialog.getByRole("button", { name: /save changes/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(this.page.getByRole("heading", { name: next.name, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
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

  async expectOverviewDate(label: string) {
    await expect(this.page.getByText(label)).toBeVisible({ timeout: 15_000 });
  }

  async expectDashboardEventChip(name: string, chip: string) {
    const eventCard = this.page.locator(".card", { has: this.page.getByRole("heading", { name }) }).first();

    await expect(eventCard.getByText(chip)).toBeVisible({ timeout: 15_000 });
  }

  private currentEventId() {
    const match = this.page.url().match(/\/events\/([0-9a-f-]+)/i);
    return match?.[1] ?? null;
  }

  private async findRowContainingValue(value: string) {
    const byNamedField = this.page.locator(".card, li.card").filter({
      has: this.page.getByRole("textbox", {
        name: new RegExp(`(?:Guest name|Title) for ${escapeRegExp(value)}`, "i"),
      }),
    });
    if (await byNamedField.count()) return byNamedField.first();

    const cards = this.page.locator(".card, li.card");
    let index = -1;
    await expect
      .poll(
        async () => {
          const n = await cards.count();
          for (let i = 0; i < n; i++) {
            const inputs = cards.nth(i).locator('input:not([type="hidden"]), textarea');
            const m = await inputs.count();
            for (let j = 0; j < m; j++) {
              if ((await inputs.nth(j).inputValue()) === value) return i;
            }
          }
          return -1;
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThan(-1);

    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const inputs = cards.nth(i).locator('input:not([type="hidden"]), textarea');
      const m = await inputs.count();
      for (let j = 0; j < m; j++) {
        if ((await inputs.nth(j).inputValue()) === value) {
          index = i;
          break;
        }
      }
      if (index >= 0) break;
    }

    return cards.nth(Math.max(index, 0));
  }
}

/** React-controlled inputs expose values via `inputValue()`, not CSS/value attrs. */
async function expectVisibleInputValue(page: Page, value: string, timeout = 15_000) {
  await expect
    .poll(
      async () => {
        const named = page.getByRole("textbox", {
          name: new RegExp(`(?:Guest name|Title) for ${escapeRegExp(value)}`, "i"),
        });
        if (await named.count()) return true;

        const inputs = page.locator('input:not([type="hidden"]), textarea');
        const n = await inputs.count();
        for (let i = 0; i < n; i++) {
          const input = inputs.nth(i);
          if (!(await input.isVisible())) continue;
          if ((await input.inputValue()) === value) return true;
        }
        return false;
      },
      { timeout }
    )
    .toBe(true);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitLocalDateTime(value: string): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const [date, timePart = ""] = value.split("T");
  const time = timePart.slice(0, 5);
  return { date, time };
}
