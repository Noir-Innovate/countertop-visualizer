import { seed } from "./seed";
import { ensureTestPromo, TEST_PROMO_CODE } from "./stripe-test";

export default async function globalSetup() {
  // Sales-spec seed. Non-fatal — onboarding specs don't need this fixture,
  // and an unrelated schema change can break the sales seed without us
  // wanting to block the rest of the suite.
  try {
    const data = await seed();
    console.log(`[e2e] seeded org ${data.orgId} (line ${data.materialLineId})`);
  } catch (err) {
    console.warn("[e2e] sales seed skipped:", (err as Error).message);
  }

  try {
    const promo = await ensureTestPromo();
    console.log(`[e2e] Stripe promo "${TEST_PROMO_CODE}" ready (${promo.promoId})`);
  } catch (err) {
    console.warn("[e2e] Stripe promo setup skipped:", (err as Error).message);
  }
}
