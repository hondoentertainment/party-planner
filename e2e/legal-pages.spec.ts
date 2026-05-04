import { expect, test } from "@playwright/test";

test.describe("Legal pages", () => {
  test("privacy and terms headings render", async ({ page }) => {
    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { level: 1, name: /privacy policy/i }),
    ).toBeVisible();
    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { level: 1, name: /terms of service/i }),
    ).toBeVisible();
  });
});
