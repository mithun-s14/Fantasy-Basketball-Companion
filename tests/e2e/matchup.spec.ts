import { test, expect } from "@playwright/test";

test.describe("Matchup page", () => {
  test("redirects unauthenticated users to /auth?next=/matchup", async ({ page }) => {
    await page.goto("/matchup");
    // Middleware should redirect unauthenticated users to /auth with next param
    await expect(page).toHaveURL(/\/auth\?next=%2Fmatchup/);
  });
});
