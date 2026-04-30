import { expect, test } from "@playwright/test";

// Public-share routes do not require auth, so these specs run in CI even when
// E2E_EMAIL / E2E_PASSWORD are not configured.
//
// Note: the canonical public share route in this app is `/s/:token` (see
// `src/App.tsx` and `EventAgent.createPublicShareLink`). The empty-state
// branch in `src/pages/PublicEventPage.tsx` is reached when the RPC returns no
// row (revoked, expired, mistyped) or the loader hits an error.

const EMPTY_STATE_PATTERN = /share link unavailable|could not load share link/i;
const EMPTY_STATE_BODY_PATTERN =
  /this event link was disabled, expired, or mistyped|missing share token|we couldn't load this share link/i;

test.describe("public share link empty states", () => {
  test("shows the unavailable empty state for a bogus token", async ({ page }) => {
    const bogus = `revoked-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto(`/s/${bogus}`);

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

    await expect(
      page.getByRole("heading", { name: EMPTY_STATE_PATTERN })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(EMPTY_STATE_BODY_PATTERN)).toBeVisible();
    await expect(page.getByRole("link", { name: /go to party planner/i })).toBeVisible();
  });
});
