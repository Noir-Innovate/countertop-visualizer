import Stripe from "stripe";
import { ensureEnvLoaded } from "./db";

export const TEST_PROMO_CODE = "TEST20";
export const TEST_PROMO_PERCENT_OFF = 20;

function client(): Stripe {
  ensureEnvLoaded();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("e2e: STRIPE_SECRET_KEY missing in .env.local");
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "e2e: STRIPE_SECRET_KEY must be a test-mode key (sk_test_...) — refusing to run e2e against live Stripe.",
    );
  }
  return new Stripe(key);
}

/**
 * Idempotently ensures a `TEST20` promotion code (20% off, forever, no expiry)
 * exists in test mode. Called from globalSetup so onboarding specs can rely
 * on it without per-test fiddling.
 */
export async function ensureTestPromo(): Promise<{ promoId: string }> {
  const stripe = client();

  const existing = await stripe.promotionCodes.list({
    code: TEST_PROMO_CODE,
    active: true,
    limit: 1,
    expand: ["data.coupon"],
  });
  if (existing.data[0]) {
    return { promoId: existing.data[0].id };
  }

  const coupon = await stripe.coupons.create({
    percent_off: TEST_PROMO_PERCENT_OFF,
    duration: "forever",
    name: "E2E Test 20% Off",
    metadata: { e2e: "1" },
  });
  const promo = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: TEST_PROMO_CODE,
    active: true,
    metadata: { e2e: "1" },
  });
  return { promoId: promo.id };
}
