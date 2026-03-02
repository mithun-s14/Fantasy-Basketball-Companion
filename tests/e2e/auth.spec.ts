import { test, expect } from "@playwright/test";

test.describe("Auth", () => {
  test("login form is visible by default", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("signup form loads via ?tab=signup", async ({ page }) => {
    await page.goto("/auth?tab=signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
  });

  test('"Create an account" link navigates to signup', async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("link", { name: /create an account/i }).click();
    await expect(page).toHaveURL(/tab=signup/);
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
  });

  test("invalid credentials shows error", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Email").fill("invalid@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10000 });
  });
});
