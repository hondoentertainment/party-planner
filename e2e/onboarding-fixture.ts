import { test as base, expect } from "@playwright/test";
import { E2E_STORAGE_KEYS } from "./test-fixture";

/**
 * Onboarding specs need a fresh tour — privacy ack only, not onboarding completion.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript((key) => {
      window.localStorage.setItem(key, "1");
    }, E2E_STORAGE_KEYS.privacy);
    await use(context);
  },
});

export { expect };
