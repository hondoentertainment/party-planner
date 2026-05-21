import { test as base, expect, type Browser, type BrowserContext } from "@playwright/test";

/** Matches app localStorage keys used by E2E prep. */
export const E2E_STORAGE_KEYS = {
  privacy: "party-planner-essential-privacy-ack",
  onboarding: "onboarding-completed-v1",
} as const;

/** Pre-ack overlays that block clicks on fresh browser contexts. */
export async function applyE2eStorageKeys(context: BrowserContext) {
  await context.addInitScript((keys) => {
    window.localStorage.setItem(keys.privacy, "1");
    window.localStorage.setItem(keys.onboarding, "1");
  }, E2E_STORAGE_KEYS);
}

/** Anonymous viewer contexts need the same storage prep as the default fixture. */
export async function newPreparedBrowserContext(browser: Browser) {
  const context = await browser.newContext();
  await applyE2eStorageKeys(context);
  return context;
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await applyE2eStorageKeys(context);
    await use(context);
  },
});

export { expect };
