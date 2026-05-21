import { test as base, expect } from "@playwright/test";

/** Matches `EssentialCookiesBanner` localStorage key in the app. */
const PRIVACY_NOTICE_STORAGE_KEY = "party-planner-essential-privacy-ack";

/**
 * Pre-acknowledge the essential privacy notice so E2E clicks are not blocked
 * by the bottom `EssentialCookiesBanner` on fresh browser contexts.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript((key) => {
      window.localStorage.setItem(key, "1");
    }, PRIVACY_NOTICE_STORAGE_KEY);
    await use(context);
  },
});

export { expect };
