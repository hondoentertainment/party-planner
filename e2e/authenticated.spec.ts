import { test } from "@playwright/test";
import { AuthAgent } from "./agents/auth-agent";
import { EventAgent } from "./agents/event-agent";
import { PublicEventAgent } from "./agents/public-event-agent";
import { getE2ECredentials } from "./agents/test-env";

const credentials = getE2ECredentials();

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
      await publicEvent.expectMenuItem(menuItem);
    } finally {
      await publicContext.close();
    }
  });
});

function localDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}
