import { test } from "@playwright/test";
import { AuthAgent } from "./agents/auth-agent";
import { EventAgent } from "./agents/event-agent";
import { WrapUpAgent } from "./agents/wrap-up-agent";
import { getE2ECredentials } from "./agents/test-env";

const credentials = getE2ECredentials();

test.describe("wrap-up persistence", () => {
  test.skip(
    !credentials,
    "add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, and E2E_PASSWORD to run signed-in E2E tests"
  );

  test.beforeEach(async ({ page }) => {
    await new AuthAgent(page).signIn(credentials!);
  });

  test("persists summary and lessons across reload and clears cleanly", async ({ page }) => {
    const events = new EventAgent(page);
    const wrap = new WrapUpAgent(page);
    const stamp = `E2E wrap-up ${Date.now()}`;
    const summary = `Guests loved the signature cocktail ${Date.now()}`;
    const lessons = `Buy ice an hour earlier next time ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openWrapUp();
    await wrap.expectVisible();

    await wrap.fill({ summary, lessons });
    await wrap.save();

    await page.reload();
    await wrap.expectVisible();
    await wrap.expectValues({ summary, lessons });

    // Cleanup so the event is left in a pristine state and the test stays
    // idempotent across re-runs.
    await wrap.clear();
    await wrap.save();

    await page.reload();
    await wrap.expectVisible();
    await wrap.expectValues({ summary: "", lessons: "" });
  });
});
