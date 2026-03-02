import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("home page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Fantasy Basketball/i);
  });

  test("auth page has no navbar (Schedule Analyzer link absent)", async ({ page }) => {
    await page.goto("/auth");
    await expect(
      page.getByRole("link", { name: /schedule analyzer/i })
    ).not.toBeVisible();
  });

  test("/roster redirects to /auth when unauthenticated", async ({ page }) => {
    await page.goto("/roster");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("/analyzer loads", async ({ page }) => {
    await page.goto("/analyzer");
    await expect(page.getByText(/schedule analyzer/i).first()).toBeVisible();
  });
});
