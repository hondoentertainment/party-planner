import { expect, test, newPreparedBrowserContext } from "./test-fixture";
import { AuthAgent } from "./agents/auth-agent";
import { EventAgent } from "./agents/event-agent";
import { PublicEventAgent } from "./agents/public-event-agent";
import { getE2ECredentials } from "./agents/test-env";

const credentials = getE2ECredentials();

// =============================================================================
// Anonymous-only smoke checks for the redesigned public share page (Item 1, 2,
// 6, 10, 19, 23). These assert *DOM structure* on a guaranteed-empty share so
// they can run in CI without `E2E_EMAIL` / `E2E_PASSWORD`.
// =============================================================================
test.describe("public share — empty-state hero structure", () => {
  // Accept BOTH the "share link unavailable" not-found variant (RPC returns
  // null) and the "could not load share link" error variant (RPC errored or
  // Supabase env is missing in the build) — both render the same hero card.
  // See `share-revoked.spec.ts` for prior art.
  const HERO_HEADING =
    /invitation link inactive|share link unavailable|could not load share link|could not load invite/i;
  const HERO_BODY =
    /disabled, expired|turned off by the host|could not be found|ask the host|missing share token|internet connection|timed out|went wrong while loading|mistyped/i;

  test("renders the unavailable card with the canonical home CTA", async ({ page }) => {
    await page.goto("/s/-");
    // If the bundle was built without VITE_SUPABASE_* env, App.tsx renders
    // <SetupNotice /> for every route — including /s/. Skip cleanly so local
    // `npm run verify` doesn't fail on a known-environment limitation.
    const setup = page.getByRole("heading", { name: /almost ready to party/i });
    if (await setup.isVisible({ timeout: 2_000 }).catch(() => false)) {
      test.skip(
        true,
        "SetupNotice is rendered — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before `npm run build` to exercise public-page DOM."
      );
      return;
    }
    await expect(page.getByRole("heading", { name: HERO_HEADING })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(HERO_BODY)).toBeVisible();
    await expect(page.getByRole("link", { name: /go to party planner/i })).toBeVisible();
  });
});

// =============================================================================
// Signed-in flow that seeds a real event + public share, then re-opens it as
// an anonymous viewer to exercise the new RSVP segmented control, calendar
// dropdown, social-proof chip behavior, and forward-to-a-friend affordance.
// =============================================================================
test.describe("with E2E credentials — public RSVP happy path", () => {
  test.skip(
    !credentials,
    "add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, and E2E_PASSWORD to run signed-in E2E tests"
  );

  test.beforeEach(async ({ page }) => {
    await new AuthAgent(page).signIn(credentials!);
  });

  test("public viewer sees the new RSVP control, calendar dropdown, and host avatar", async ({
    browser,
    page,
  }) => {
    const events = new EventAgent(page);
    const stamp = `E2E rsvp ${Date.now()}`;

    await events.createBlankEvent(stamp, {
      location: "RSVP test backyard",
    });
    const publicUrl = await events.createPublicShareLink();

    const publicContext = await newPreparedBrowserContext(browser);
    const publicPage = await publicContext.newPage();
    const publicEvent = new PublicEventAgent(publicPage);

    try {
      await publicEvent.open(publicUrl);
      await publicEvent.expectEventDetails(stamp, {
        location: "RSVP test backyard",
      });

      // Item 2.3 — Hosted-by avatar+name surfaced above the RSVP control.
      await expect(
        publicPage.getByText(/hosted by/i)
      ).toBeVisible();

      // Item 2.4 / Item 6 — Yes/Maybe/No segmented control with icons is the
      // primary above-the-fold interaction.
      await publicEvent.expectRsvpSegmentedControl();

      // Item 2.6 / Item 10 — Single Add-to-calendar dropdown replaces the old
      // dual Google/Apple buttons.
      await publicEvent.expectAddToCalendarDropdown();

      // Item 23 — At zero RSVPs the social-proof chip should NOT render
      // (we never want to advertise "0 going").
      await publicEvent.expectNoSocialProofChip();
    } finally {
      await publicContext.close();
    }
  });

  test("submitting an RSVP reveals the confirmation card with forward-to-a-friend", async ({
    browser,
    page,
  }) => {
    const events = new EventAgent(page);
    const stamp = `E2E rsvp submit ${Date.now()}`;
    const guestName = `RSVP Test ${Date.now()}`;

    await events.createBlankEvent(stamp);
    const publicUrl = await events.createPublicShareLink();

    const publicContext = await newPreparedBrowserContext(browser);
    const publicPage = await publicContext.newPage();
    const publicEvent = new PublicEventAgent(publicPage);

    try {
      await publicPage.goto(publicUrl);
      await expect(
        publicPage.getByRole("heading", { name: stamp, level: 1 })
      ).toBeVisible({ timeout: 15_000 });

      await publicEvent.pickRsvpChoice("in");
      const nameInput = publicPage.getByLabel(/your name/i);

      // Required-name errors are exposed through both alert text and input
      // invalid state so screen-reader users get the same recovery path.
      await publicEvent.submitRsvp();
      await expect(
        publicPage.getByRole("alert").filter({ hasText: /please tell us your name/i }),
      ).toBeVisible();
      await expect(nameInput).toHaveAttribute("aria-invalid", "true");

      // Name input is required; everything else is optional.
      await nameInput.fill(guestName);
      await publicEvent.submitRsvp();

      // Confirmed-state card surfaces our name and the Forward-to-a-friend
      // affordance (Item 19).
      await publicEvent.expectRsvpThanks(guestName);

      await expect(
        publicPage.getByRole("button", { name: /forward to a friend/i })
      ).toBeVisible();
    } finally {
      await publicContext.close();
    }
  });

  test("after RSVP with email, recovery link CTA completes the happy-path banner", async ({
    browser,
    page,
  }) => {
    const events = new EventAgent(page);
    const stamp = `E2E recovery ${Date.now()}`;
    const guestName = `Recovery Guest ${Date.now()}`;
    const guestEmail = `e2e-recovery-${Date.now()}@example.com`;

    await events.createBlankEvent(stamp);
    const publicUrl = await events.createPublicShareLink();

    const publicContext = await newPreparedBrowserContext(browser);
    const publicPage = await publicContext.newPage();
    const publicEvent = new PublicEventAgent(publicPage);

    try {
      await publicPage.goto(publicUrl);
      await expect(
        publicPage.getByRole("heading", { name: stamp, level: 1 })
      ).toBeVisible({ timeout: 15_000 });

      await publicEvent.pickRsvpChoice("in");
      await publicPage.getByLabel(/your name/i).fill(guestName);
      await publicPage.getByLabel(/email \(optional\)/i).fill(guestEmail);
      await publicEvent.submitRsvp();
      await publicEvent.expectRsvpThanks(guestName);

      await publicPage
        .getByRole("button", { name: /email me a recovery link/i })
        .click();

      await expect(publicPage.getByText(new RegExp(`Check ${guestEmail} for the link`, "i"))).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await publicContext.close();
    }
  });

  /**
   * Same anonymous session + same email on second submit should upsert (migration
   * `0025`) rather than failing on a duplicate. Strict: confirmation heading and
   * no `role="alert"` RSVP error banner after the second RPC completes.
   */
  test("repeat RSVP submit with same email upserts without error", async ({
    browser,
    page,
  }) => {
    const events = new EventAgent(page);
    const stamp = `E2E email upsert ${Date.now()}`;
    const guestEmail = `e2e-upsert-${Date.now()}@example.com`;
    const guestNameFirst = `Upsert Guest A ${Date.now()}`;
    const guestNameSecond = `Upsert Guest B ${Date.now()}`;

    await events.createBlankEvent(stamp);
    const publicUrl = await events.createPublicShareLink();

    const publicContext = await newPreparedBrowserContext(browser);
    const publicPage = await publicContext.newPage();
    const publicEvent = new PublicEventAgent(publicPage);

    try {
      await publicPage.goto(publicUrl);
      await expect(
        publicPage.getByRole("heading", { name: stamp, level: 1 })
      ).toBeVisible({ timeout: 15_000 });

      // First submit — seed guest row keyed by normalized email (when upsert is active).
      await publicEvent.pickRsvpChoice("in");
      await publicPage.getByLabel(/your name/i).fill(guestNameFirst);
      await publicPage.getByLabel(/email \(optional\)/i).fill(guestEmail);
      await publicEvent.submitRsvp();
      await publicEvent.expectRsvpThanks(guestNameFirst);

      // Second submit — same email, different display name + RSVP (still one logical guest).
      await publicPage.getByRole("button", { name: /update rsvp/i }).click();
      await publicPage.getByLabel(/your name/i).fill(guestNameSecond);
      await publicPage.getByRole("radio", { name: /maybe/i }).first().click();
      await expect(publicPage.getByLabel(/email \(optional\)/i)).toHaveValue(guestEmail);
      await publicEvent.submitRsvp();
      await publicEvent.expectRsvpThanks(guestNameSecond);

      await expect(publicPage.getByRole("alert")).toHaveCount(0);
    } finally {
      await publicContext.close();
    }
  });
});
