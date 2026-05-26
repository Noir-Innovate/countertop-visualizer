import {
  test,
  expect,
  loginAs,
  createOrgAndAdvanceToTrial,
} from "./support/onboarding-fixtures";
import { TEST_PROMO_CODE } from "./support/stripe-test";

test.describe("Onboarding · Promo codes", () => {
  test("valid promo code (lowercased input) applies and updates pricing", async ({
    page,
    testUser,
  }) => {
    await loginAs(page, testUser);
    await createOrgAndAdvanceToTrial(page);

    // Pricing block visible with the base monthly price.
    await expect(page.getByTestId("pricing-block")).toBeVisible();
    await expect(page.getByTestId("base-price")).toBeVisible();

    // Open the promo input.
    await page.getByRole("button", { name: /have a promo code/i }).click();
    // Type the code in *lowercase* to exercise the case-insensitivity fix.
    await page.getByPlaceholder("WELCOME20").fill(TEST_PROMO_CODE.toLowerCase());
    await page.getByRole("button", { name: /^apply$/i }).click();

    // Green banner confirms application.
    const banner = page.getByTestId("promo-applied-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(TEST_PROMO_CODE);

    // Base price is strikethrough; discounted price shown.
    await expect(page.getByTestId("base-price-strikethrough")).toBeVisible();
    const discounted = page.getByTestId("discounted-price");
    await expect(discounted).toBeVisible();

    // The TEST20 promo is 20% off. We don't hardcode the dollar amount since
    // STRIPE_INTERNAL_PLAN_PRICE_ID can vary per env, but we assert the
    // discounted value is strictly less than the base.
    const baseText = await page
      .getByTestId("base-price-strikethrough")
      .textContent();
    const discountedText = await discounted.textContent();
    const parseUsd = (s: string | null) =>
      Number((s ?? "").replace(/[^0-9.]/g, ""));
    const baseValue = parseUsd(baseText);
    const discountedValue = parseUsd(discountedText);
    expect(discountedValue).toBeGreaterThan(0);
    expect(discountedValue).toBeLessThan(baseValue);
    // 20% off → discounted ≈ 80% of base (allow 1¢ rounding wiggle).
    expect(Math.abs(discountedValue - baseValue * 0.8)).toBeLessThan(0.02);
  });

  test("unknown promo code shows a clear error", async ({ page, testUser }) => {
    await loginAs(page, testUser);
    await createOrgAndAdvanceToTrial(page);

    await page.getByRole("button", { name: /have a promo code/i }).click();
    await page.getByPlaceholder("WELCOME20").fill("THIS-CODE-DOES-NOT-EXIST");
    await page.getByRole("button", { name: /^apply$/i }).click();

    const err = page.getByTestId("promo-error");
    await expect(err).toBeVisible({ timeout: 10_000 });
    await expect(err).toContainText(/not found|invalid/i);

    // Pricing block remains at base price (no strikethrough, no discount).
    await expect(page.getByTestId("base-price")).toBeVisible();
    await expect(
      page.getByTestId("base-price-strikethrough"),
    ).not.toBeVisible();
  });
});
