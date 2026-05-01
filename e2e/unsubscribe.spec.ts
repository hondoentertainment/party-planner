import { expect, test } from "@playwright/test";

// Anonymous-only smoke: hitting the `notify-unsubscribe` Edge Function with
// an obviously-bogus token must return a 400 with the friendly inline-styled
// HTML page (the same one a user with an expired link would see).
//
// We deliberately skip the happy path because minting a *valid* token would
// require the production `UNSUBSCRIBE_TOKEN_SECRET`, which we don't expose
// to CI. The unhappy path is enough to catch deploy-time regressions like
// "function isn't deployed" or "function is rejecting all GETs".
test.describe("notify-unsubscribe edge function", () => {
  test("invalid token renders the 400 friendly page", async ({ request }) => {
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    if (!supabaseUrl) {
      test.skip(
        true,
        "VITE_SUPABASE_URL is not set; skipping live notify-unsubscribe smoke.",
      );
      return;
    }

    const res = await request.get(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/notify-unsubscribe?token=invalid`,
      { failOnStatusCode: false },
    );

    expect(res.status()).toBe(400);
    const body = await res.text();
    // The error page should be the HTML "we couldn't unsubscribe you" card,
    // not raw JSON or the Supabase auth gateway's default response.
    expect(body).toContain("We couldn&#039;t unsubscribe you");
    expect(body).toMatch(/Open settings/i);
  });
});
