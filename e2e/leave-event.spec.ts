import { expect, test } from "@playwright/test";
import { AuthAgent } from "./agents/auth-agent";
import { EventAgent } from "./agents/event-agent";
import { getE2ECredentials } from "./agents/test-env";

const credentials = getE2ECredentials();

test.describe("settings & team leave-event affordance", () => {
  test.skip(
    !credentials,
    "add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, and E2E_PASSWORD to run signed-in E2E tests"
  );

  test.beforeEach(async ({ page }) => {
    await new AuthAgent(page).signIn(credentials!);
  });

  // Non-destructive check: the "Leave event" affordance only renders for
  // collaborators (see `EventSettings.tsx`). Walk the user's existing events
  // looking for one where the button is visible, then assert visibility plus
  // accessibility-name and enabled state. We never click the button so the
  // collaborator membership is preserved.
  test("collaborator events expose a reachable Leave event button with proper aria", async ({
    page,
  }) => {
    const events = new EventAgent(page);

    await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible({
      timeout: 25_000,
    });

    const eventLinks = page.locator('a[href^="/events/"]');
    const total = await eventLinks.count();
    test.skip(total === 0, "Sign-in account has no events to inspect.");

    let collaboratorFound = false;
    for (let i = 0; i < total; i += 1) {
      // Re-resolve the locator after each navigation to avoid stale handles.
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /your events/i })).toBeVisible({
        timeout: 25_000,
      });
      const link = page.locator('a[href^="/events/"]').nth(i);
      await link.click();
      await expect(page).toHaveURL(/\/events\/[0-9a-f-]+/i, { timeout: 25_000 });

      await events.openSettings();
      const leaveBtn = page.getByRole("button", { name: /leave event/i });

      if (await leaveBtn.isVisible().catch(() => false)) {
        await expect(leaveBtn).toBeVisible();
        await expect(leaveBtn).toBeEnabled();
        await expect(leaveBtn).toHaveAttribute("type", "button");
        await expect(
          page.getByRole("heading", { name: /leave this event/i })
        ).toBeVisible();
        collaboratorFound = true;
        break;
      }
    }

    test.skip(
      !collaboratorFound,
      "Test account is the owner of every visible event; invite this user to a peer's event to exercise the Leave event button."
    );
  });
});
