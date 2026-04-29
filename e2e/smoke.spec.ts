import { test } from "@playwright/test";
import { AuthAgent } from "./agents/auth-agent";
import { EventAgent } from "./agents/event-agent";
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

  test("MVP modules save budget vendor wrap-up and public share", async ({ page }) => {
    const events = new EventAgent(page);
    const stamp = `E2E MVP ${Date.now()}`;

    await events.createBlankEvent(stamp);
    await events.openBudget();
    await events.addBudgetItem("Venue deposit", "250", "275");
    await events.openVendors();
    await events.addVendor("DJ Test", "555-0101");
    await events.openWrapUp();
    await events.saveWrapUp("The MVP smoke flow worked.", "12");
    await events.createPublicShareLink();
  });
});
