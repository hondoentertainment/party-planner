import { expect, test } from "@playwright/test";
import { AuthAgent } from "./agents/auth-agent";
import { EventAgent } from "./agents/event-agent";
import { getE2ECredentials } from "./agents/test-env";

const credentials = getE2ECredentials();

// Item 9 — IA refactor reduced 17 flat tabs to 8 grouped categories on
// desktop, with a contextual sub-row for active groups; on mobile the More
// sheet groups its tile grid by the same categories.
const EXPECTED_GROUPS = [
  "Overview",
  "Plan",
  "Guests",
  "Food & Drink",
  "Setup",
  "Atmosphere",
  "Vendors",
  "Settings",
];

test.describe("with E2E credentials — event IA structure", () => {
  test.skip(
    !credentials,
    "add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, and E2E_PASSWORD to run signed-in E2E tests"
  );

  test.beforeEach(async ({ page }) => {
    await new AuthAgent(page).signIn(credentials!);
  });

  test("desktop nav shows 8 top-level groups and reveals sub-tabs on selection", async ({
    page,
  }) => {
    const events = new EventAgent(page);
    const stamp = `E2E IA ${Date.now()}`;

    await events.createBlankEvent(stamp);

    // Force a desktop viewport — the two-row group nav only renders ≥ sm.
    await page.setViewportSize({ width: 1280, height: 900 });

    const groupNav = page.getByRole("navigation", { name: /event sections/i });
    await expect(groupNav).toBeVisible();

    for (const label of EXPECTED_GROUPS) {
      await expect(
        groupNav.getByRole("link", { name: new RegExp(`^${escapeRegExp(label)}$`, "i") })
      ).toBeVisible();
    }

    // Tap "Food & Drink" → sub-row should expose Menu / Beverages / Shopping /
    // Budget. The sub-row aria-label is `<group> sub-sections`.
    await groupNav.getByRole("link", { name: /^Food & Drink$/i }).click();

    const subNav = page.getByRole("navigation", { name: /food & drink sub-sections/i });
    await expect(subNav).toBeVisible();
    for (const sub of ["Menu", "Beverages", "Shopping", "Budget"]) {
      await expect(
        subNav.getByRole("link", { name: new RegExp(`^${escapeRegExp(sub)}$`, "i") })
      ).toBeVisible();
    }

    // Plan group: primary nav should open Timeline (and show Plan sub-row).
    await groupNav.getByRole("link", { name: /^Plan$/i }).click();
    await expect(page.getByRole("heading", { name: /^Timeline$/i })).toBeVisible();
    const planSub = page.getByRole("navigation", { name: /plan sub-sections/i });
    await expect(planSub.getByRole("link", { name: /^Timeline$/i })).toBeVisible();
    await expect(planSub.getByRole("link", { name: /^Post-party$/i })).toBeVisible();
  });

  test("from Menu route, Plan opens Timeline (absolute navigation)", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E route ${Date.now()}`;

    await events.createBlankEvent(stamp);

    await page.setViewportSize({ width: 1280, height: 900 });

    const groupNav = page.getByRole("navigation", { name: /event sections/i });
    await groupNav.getByRole("link", { name: /^Food & Drink$/i }).click();
    await groupNav.getByRole("link", { name: /^Menu$/i }).click();

    await expect(page.getByRole("heading", { name: /Food & Menu/i })).toBeVisible();

    await groupNav.getByRole("link", { name: /^Plan$/i }).click();
    await expect(page.getByRole("heading", { name: /^Timeline$/i })).toBeVisible();
  });

  test("mobile More sheet groups tabs under category headers", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E IA mobile ${Date.now()}`;

    await events.createBlankEvent(stamp);

    await page.setViewportSize({ width: 390, height: 844 });

    const moreBtn = page.getByRole("button", { name: /more sections/i });
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();

    const sheet = page.getByRole("dialog", { name: /all sections/i });
    await expect(sheet).toBeVisible();

    // Each non-trivial group renders a labelled <section>; assert the
    // multi-tab groups (Food & Drink, Setup, Atmosphere) are present and that
    // their tile labels appear within the sheet.
    for (const group of ["Food & Drink", "Setup", "Atmosphere"]) {
      await expect(sheet.getByRole("region", { name: new RegExp(`^${escapeRegExp(group)}$`, "i") })).toBeVisible();
    }

    // Spot-check renamed labels (Item 9 + Item 11) inside the sheet.
    await expect(sheet.getByRole("link", { name: /^Menu$/i })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /^Shopping$/i })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /^Post-party$/i })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /^Day-of setup$/i })).toBeVisible();
  });

  test("every event tab loads its module heading", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E tabs ${Date.now()}`;
    await events.createBlankEvent(stamp);

    await page.setViewportSize({ width: 1280, height: 900 });

    const eventId = page.url().match(/\/events\/([0-9a-f-]+)/i)?.[1];
    expect(eventId, "event id from URL").toBeTruthy();

    /** [path segment, expected heading regex] for every rendered tab. */
    const tabs: Array<[string, RegExp]> = [
      ["", new RegExp(`^${escapeRegExp(stamp)}$`, "i")],
      ["timeline", /^Timeline$/i],
      ["wrap-up", /post-event wrap-up/i],
      ["guests", /guest list/i],
      ["food", /food & menu/i],
      ["beverages", /^Beverages$/i],
      ["shopping", /food purchasing/i],
      ["budget", /^Budget$/i],
      ["vendors", /vendors & contacts/i],
      ["logistics", /^Logistics$/i],
      ["signs", /^Signs$/i],
      ["decorations", /^Decorations$/i],
      ["restrooms", /^Restrooms$/i],
      ["setup", /setup & teardown/i],
      ["music", /^Music$/i],
      ["games", /^Games$/i],
      ["settings", /settings & team/i],
    ];

    for (const [seg, headingRe] of tabs) {
      const path = seg ? `/events/${eventId}/${seg}` : `/events/${eventId}`;
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: headingRe }).first(),
        `tab "${seg || "overview"}" should render its heading`,
      ).toBeVisible({ timeout: 15_000 });
    }
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
