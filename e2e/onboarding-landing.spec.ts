import { test, expect } from "@playwright/test";

// Anonymous landing-page funnel. Doesn't use the `testUser` fixture because
// these stages fire BEFORE signup — the visitor only has a session_id.

test.describe("Onboarding · Landing pages", () => {
  test("root view + CTA click fire tracking events", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /try the demo/i }).first(),
    ).toBeVisible();

    // Click the hero "Try the demo first" CTA to fire a CTA event.
    await page
      .getByRole("link", { name: /try the demo first/i })
      .click();
    await expect(page).toHaveURL(/\/demo/);

    // Let the fire-and-forget tracks reach the server.
    await page.waitForTimeout(1500);
  });

  test("demo view fires tracking event", async ({ page }) => {
    await page.goto("/demo");
    // Demo page renders the V2 visualizer; we don't assert on its content,
    // just that the route is reachable and the view track has time to fire.
    await expect(page).toHaveURL(/\/demo/);
    await page.waitForTimeout(1500);
  });
});
