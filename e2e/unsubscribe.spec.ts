import { expect, test } from "./test-fixture";
import { supabaseHostResolves } from "./agents/test-env";

// Anonymous smoke: `notify-unsubscribe` must redirect to the SPA landing page
// (invalid / expired tokens → outcome=invalid). Minting a valid token requires
// production `UNSUBSCRIBE_TOKEN_SECRET`, which CI does not expose.
test.describe("notify-unsubscribe edge function", () => {
  test("invalid token responds with redirect to app unsubscribe page", async () => {
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    if (!supabaseUrl) {
      test.skip(
        true,
        "VITE_SUPABASE_URL is not set; skipping live notify-unsubscribe smoke.",
      );
      return;
    }
    if (!supabaseHostResolves(supabaseUrl)) {
      test.skip(
        true,
        "configured Supabase host does not resolve; skipping live notify-unsubscribe smoke.",
      );
      return;
    }

    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/notify-unsubscribe?token=invalid`,
      { redirect: "manual" },
    );

    expect([301, 302, 303, 307, 308]).toContain(res.status);
    const loc = res.headers.get("location");
    expect(loc).toBeTruthy();
    expect(loc!).toMatch(/\/email\/unsubscribe\?/);
    expect(loc!).toMatch(/outcome=invalid/);
  });
});

test.describe("unsubscribe landing page (SPA)", () => {
  test("invalid outcome copy is visible", async ({ page }) => {
    await page.goto("/email/unsubscribe?outcome=invalid");

    const setup = page.getByRole("heading", { name: /almost ready to party/i });
    if (await setup.isVisible({ timeout: 2_000 }).catch(() => false)) {
      test.skip(true, "SetupNotice — build without VITE_SUPABASE_* env.");
      return;
    }

    await expect(
      page.getByRole("heading", { name: /finish that link/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /email reminder preferences/i })).toBeVisible();
  });
});
