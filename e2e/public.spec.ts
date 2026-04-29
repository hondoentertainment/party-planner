import { test } from "@playwright/test";
import { AppAgent } from "./agents/app-agent";

test("loads app shell and shows sign-in, events, or setup notice", async ({ page }) => {
  const app = new AppAgent(page);

  await app.gotoHome();
  await app.expectLandingState();
});

test("forgot password page shows reset form or setup notice", async ({ page }) => {
  const app = new AppAgent(page);

  await app.gotoForgotPassword();
  await app.expectForgotPasswordState();
});
