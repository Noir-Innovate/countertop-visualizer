import { seed } from "./seed";
import { ensureTestPromo, TEST_PROMO_CODE } from "./stripe-test";

export default async function globalSetup() {
  const data = await seed();
  console.log(`[e2e] seeded org ${data.orgId} (line ${data.materialLineId})`);

  try {
    const promo = await ensureTestPromo();
    console.log(`[e2e] Stripe promo "${TEST_PROMO_CODE}" ready (${promo.promoId})`);
  } catch (err) {
    // Non-fatal: only the promo specs need this. Other specs still run.
    console.warn("[e2e] Stripe promo setup skipped:", (err as Error).message);
  }
}
