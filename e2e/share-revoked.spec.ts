import { expect, test } from "./test-fixture";

// Public-share routes do not require auth, so these specs run in CI even when
// E2E_EMAIL / E2E_PASSWORD are not configured.
//
// Note: the canonical public share route in this app is `/s/:token` (see
// `src/App.tsx` and `EventAgent.createPublicShareLink`). The empty-state
// branch in `src/pages/PublicEventPage.tsx` is reached when the RPC returns no
// row (revoked, expired, mistyped) or the loader hits an error.

const EMPTY_STATE_PATTERN =
  /invitation link inactive|share link unavailable|could not load share link|could not load invite/i;
const EMPTY_STATE_BODY_PATTERN =
  /disabled, expired|turned off by the host|could not be found|ask the host|missing share token|internet connection|timed out|went wrong while loading|mistyped/i;

// If the bundle was built without `VITE_SUPABASE_*`, App.tsx renders
// <SetupNotice /> on EVERY route — including /s/ — and we can't QA the
// public-page DOM. Skip cleanly so `npm run verify` doesn't fail locally
// when secrets are absent. CI runs with the env set and exercises the real
// branches.
async function skipIfSetupNotice(page: import("@playwright/test").Page) {
  const setup = page.getByRole("heading", { name: /almost ready to party/i });
  if (await setup.isVisible({ timeout: 2_000 }).catch(() => false)) {
    test.skip(
      true,
      "SetupNotice is rendered — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before `npm run build` to exercise public-page DOM."
    );
    return true;
  }
  return false;
}

test.describe("public share link empty states", () => {
  test("shows the unavailable empty state for a bogus token", async ({ page }) => {
    const bogus = `revoked-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto(`/s/${bogus}`);
    if (await skipIfSetupNotice(page)) return;

    await expect(
      page.getByRole("heading", { name: EMPTY_STATE_PATTERN })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(EMPTY_STATE_BODY_PATTERN)).toBeVisible();
    await expect(page.getByRole("link", { name: /go to party planner/i })).toBeVisible();
  });

  test("shows the unavailable empty state for a near-empty token", async ({ page }) => {
    // The route requires a non-empty :token segment, so use a single-character
    // sentinel to exercise the same RPC-returns-null empty state when the
    // user effectively has no real token to provide.
    await page.goto("/s/-");
    if (await skipIfSetupNotice(page)) return;

    await expect(
      page.getByRole("heading", { name: EMPTY_STATE_PATTERN })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(EMPTY_STATE_BODY_PATTERN)).toBeVisible();
    await expect(page.getByRole("link", { name: /go to party planner/i })).toBeVisible();
  });
});
