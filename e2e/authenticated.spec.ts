import { expect, test } from "@playwright/test";
import { AuthAgent } from "./agents/auth-agent";
import { EventAgent } from "./agents/event-agent";
import { PublicEventAgent } from "./agents/public-event-agent";
import { getE2ECredentials } from "./agents/test-env";
import { formatEventDate } from "../src/lib/format";

const credentials = getE2ECredentials();

const EVENT_SECTIONS = [
  { label: "Overview", expected: /event details/i, kind: "card" },
  { label: "Timeline", expected: /^Timeline$/i },
  { label: "Guests", expected: /guest list/i },
  { label: "Food", expected: /food & menu/i },
  { label: "Beverages", expected: /^Beverages$/i },
  { label: "Food Purchasing", expected: /food purchasing/i },
  { label: "Budget", expected: /^Budget$/i },
  { label: "Vendors", expected: /vendors & contacts/i },
  { label: "Logistics", expected: /^Logistics$/i },
  { label: "Signs", expected: /^Signs$/i },
  { label: "Games", expected: /^Games$/i },
  { label: "Music", expected: /^Music$/i },
  { label: "Restrooms", expected: /^Restrooms$/i },
  { label: "Decorations", expected: /^Decorations$/i },
  { label: "Setup", expected: /setup & teardown/i },
  { label: "Wrap-up", expected: /post-event wrap-up/i },
  { label: "Settings", expected: /settings & team/i },
];

const CHECKLIST_SECTIONS = [
  "Logistics",
  "Signs",
  "Games",
  "Restrooms",
  "Decorations",
  "Setup",
];

test.describe("with E2E credentials", () => {
  test.skip(
    !credentials,
    "add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, and E2E_PASSWORD to run signed-in E2E tests"
  );

  test.beforeEach(async ({ page }) => {
    await new AuthAgent(page).signIn(credentials!);
  });

  test("reaches the dashboard", async ({ page }) => {
    await new AuthAgent(page).expectDashboard();
  });

  test("creates a blank event from the dashboard", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E ${Date.now()}`;

    await events.createBlankEvent(stamp);
  });

  test("opens settings for a new event", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E team ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openSettings();
  });

  test("surfaces collaboration and notification trust paths", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E trust ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openSettings();
    await expect(page.getByText(/owner \(you\)/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /leave event/i })).toHaveCount(0);

    await page.getByLabel(/collaborator email/i).fill(`missing-${Date.now()}@example.com`);
    await page.getByLabel(/default role/i).selectOption("viewer");
    await page.getByRole("button", { name: /^Invite$/i }).click();
    await expect(page.getByText(/no user with that email|ask them to sign up/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /notifications/i }).click();
    await expect(page.getByRole("dialog", { name: /notifications/i })).toBeVisible();
    await expect(page.getByText(/no notifications yet|unread/i)).toBeVisible();
  });

  test("opens every party section tab from nested routes", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E tabs ${Date.now()}`;

    await events.createBlankEvent(stamp);
    for (const section of EVENT_SECTIONS) {
      await events.openSection(section.label);
      if (section.kind === "card") {
        await page.locator(".card", { hasText: section.expected }).first().waitFor({
          state: "visible",
          timeout: 15_000,
        });
      } else {
        await page.getByRole("heading", { name: section.expected }).waitFor({
          state: "visible",
          timeout: 15_000,
        });
      }
    }
  });

  test("adds starter timeline tasks and assigns one", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E assign ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openTimeline();
    await events.addStarterTasks();
    await events.assignFirstTaskTo(credentials!.displayName);
  });

  test("imports guests and tracks attendance counts", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E guests ${Date.now()}`;
    const guestName = `Guest ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openGuests();
    await events.importGuests(`${guestName},${guestName}@example.com,yes,2,Vegan|Nut-free,VIP`, 1);
    await events.expectHeadsToFeed(3);
  });

  test("links guest attendance to menu serving guidance", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E food ${Date.now()}`;
    const guestName = `Hungry Guest ${Date.now()}`;
    const menuItem = `Mini tacos ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openGuests();
    await events.addGuest(guestName);
    await events.markGuestGoing(guestName);
    await events.setGuestPlusOnes(guestName, 1);
    await events.openFood();
    await events.addFoodItem(menuItem);
    await events.setFoodServings(menuItem, 1);
    await events.expectMenuServingGuidance(2, 1, 1);
  });

  test("tracks shopping estimates and purchased spend", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E shopping ${Date.now()}`;
    const shoppingItem = `Sparkling water ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openShopping();
    await events.addShoppingItem(shoppingItem, "Trader Joe's");
    await events.setShoppingEstimate(shoppingItem, "12.50");
    await events.markShoppingItemPurchased(shoppingItem, "11.25");
  });

  test("saves the operational checklist modules", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E checklists ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.addChecklistItem("Logistics", "Confirm parking signs");
    await events.addChecklistItem("Signs", "Welcome sign");
    await events.expandChecklistItem("Welcome sign");
    await events.fillChecklistDetail("Welcome sign", "Sign text", "Welcome to the party");
    await events.addChecklistItem("Games", "Lawn games station");
    await events.expandChecklistItem("Lawn games station");
    await events.fillChecklistDetail("Lawn games station", "Supplies needed", "Cornhole boards");
    await events.addChecklistItem("Restrooms", "Stock guest bath");
    await events.expandChecklistItem("Stock guest bath");
    await events.fillChecklistDetail("Stock guest bath", "Quantity", "3 rolls");
    await events.addChecklistItem("Decorations", "Hang string lights");
    await events.expandChecklistItem("Hang string lights");
    await events.fillChecklistDetail("Hang string lights", "Area", "Backyard");
    await events.addChecklistItem("Setup", "Arrange lounge chairs");
    await events.expandChecklistItem("Arrange lounge chairs");
    await events.fillChecklistDetail("Arrange lounge chairs", "Time needed", "30");
  });

  test("opens secondary event sections from the mobile more sheet", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E mobile more ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await page.setViewportSize({ width: 390, height: 844 });
    await events.openMobileMoreSection("Beverages");
    await expect(page.getByRole("heading", { name: /^Beverages$/i })).toBeVisible();
  });

  test("adds beverages and music planning items", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E media ${Date.now()}`;
    const beverage = `Lemonade ${Date.now()}`;
    const track = `Dance track ${Date.now()}`;
    const playlist = `Party playlist ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openBeverages();
    await events.addBeverage(beverage, "Non-alcoholic");
    await events.updateBeverageQuantity(beverage, "3", "pitchers");
    await events.openMusic();
    await events.addMusicTrack(track, "E2E Artist", "Arrival");
    await events.addPlaylist(playlist, "https://example.com/playlist");
  });

  test("adds items to reusable checklist party sections", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E checklist ${Date.now()}`;

    await events.createBlankEvent(stamp);
    for (const section of CHECKLIST_SECTIONS) {
      const item = `${section} item ${Date.now()}`;

      await events.addChecklistItem(section, item);
      await events.expandChecklistItem(item);
    }
  });

  test("shows dated events on the calendar", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E calendar ${Date.now()}`;

    await events.createBlankEvent(stamp, {
      startsAt: localDateTimeValue(new Date()),
      location: "Calendar test lawn",
    });
    await events.openCalendar();
    await events.expectCalendarEvent(stamp);
  });

  test("preserves same-day event date and dashboard status", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E date ${Date.now()}`;
    const startsAt = localDateTimeValue(new Date(), 23, 30);

    await events.createBlankEvent(stamp, {
      startsAt,
      location: "Date test patio",
    });
    await events.expectOverviewDate(formatEventDate(new Date(startsAt).toISOString()));
    await events.openDashboard();
    await events.expectDashboardEventChip(stamp, "Today");
  });

  test("edits event details and keeps updated date visible", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E edit ${Date.now()}`;
    const updatedName = `${stamp} updated`;
    const startsAt = localDateTimeValue(new Date(), 18, 45);

    await events.createBlankEvent(stamp);
    await events.editEventDetails({
      name: updatedName,
      location: "Updated test venue",
      theme: "Updated neon theme",
      startsAt,
    });
    await events.expectOverviewDate(formatEventDate(new Date(startsAt).toISOString()));
  });

  test("publishes event details to the public share page", async ({ browser, page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E public ${Date.now()}`;
    const guestName = `Public Guest ${Date.now()}`;
    const menuItem = `Public sliders ${Date.now()}`;

    await events.createBlankEvent(stamp, {
      location: "Public test venue",
      theme: "Share page luau",
    });
    await events.openGuests();
    await events.addGuest(guestName);
    await events.markGuestGoing(guestName);
    await events.openFood();
    await events.addFoodItem(menuItem);
    await events.openBeverages();
    await events.addBeverage("Public sparkling water");
    await events.openMusic();
    await events.addMusicTrack("Public dance track", "Test DJ");
    await events.openTimeline();
    await events.addStarterTasks();
    const publicUrl = await events.createPublicShareLink();

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    const publicEvent = new PublicEventAgent(publicPage);

    try {
      await publicEvent.open(publicUrl);
      await publicEvent.expectEventDetails(stamp, {
        location: "Public test venue",
        theme: "Share page luau",
      });
      await publicEvent.expectRsvpSummary("Going", 1);
      await publicEvent.expectScheduleItem("Confirm guest list");
      await publicEvent.expectPublicSection("Food");
      await publicEvent.expectMenuItem(menuItem);
      await publicEvent.expectPublicSection("Drinks");
      await publicEvent.expectDrinkItem("Public sparkling water");
      await publicEvent.expectPublicSection("Music");
      await publicEvent.expectMusicItem("Public dance track");
    } finally {
      await publicContext.close();
    }
  });
});

function localDateTimeValue(date: Date, hours = date.getHours(), minutes = date.getMinutes()) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hours)}:${pad(minutes)}`;
}
