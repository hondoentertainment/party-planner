import { expect, test } from "@playwright/test";
import { AuthAgent } from "./agents/auth-agent";
import { EventAgent } from "./agents/event-agent";
import { getE2ECredentials } from "./agents/test-env";

const credentials = getE2ECredentials();

test.describe("public share — bug report dialog", () => {
  test.skip(
    !credentials,
    "add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, and E2E_PASSWORD to submit a guest bug report against a live share link"
  );

  test.beforeEach(async ({ page }) => {
    await new AuthAgent(page).signIn(credentials!);
  });

  test("guest can submit a bug report from the public share page", async ({
    browser,
    page,
  }) => {
    const events = new EventAgent(page);
    const stamp = `E2E bug ${Date.now()}`;
    await events.createBlankEvent(stamp);
    const publicUrl = await events.createPublicShareLink();

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    try {
      await publicPage.goto(publicUrl);
      const heading = publicPage.getByRole("heading", {
        name: new RegExp(stamp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      });
      await expect(heading).toBeVisible({ timeout: 25_000 });

      await publicPage.getByRole("button", { name: /problem with this page/i }).click();
      await expect(
        publicPage.getByRole("dialog", { name: /report a bug/i })
      ).toBeVisible();

      await publicPage.getByLabel(/short title/i).fill("Public page bug E2E");
      await publicPage
        .getByLabel(/what happened/i)
        .fill("This is an automated E2E report with enough detail to pass validation.");

      await publicPage.getByRole("button", { name: /submit report/i }).click();
      await expect(publicPage.getByText(/report submitted/i)).toBeVisible({ timeout: 20_000 });
    } finally {
      await publicContext.close();
    }
  });
});
