import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Submits the /dashboard/login form. Resolves once the post-login navigation
 * has settled (a sales_person should land on /sales/...).
 */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/dashboard/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/dashboard/login"), {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

export async function signOut(page: Page) {
  // No global sign-out button is exposed for salespeople; clear cookies/storage.
  await page.context().clearCookies();
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
}

export async function expectSignedIn(page: Page) {
  await expect(page).toHaveURL(/\/sales(\/|$)/);
}
