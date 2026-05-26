import {
  test,
  expect,
  loginAs,
  createOrgAndAdvanceToTrial,
} from "./support/onboarding-fixtures";
import { serviceClient } from "./support/db";

// Validates the website-scrape leg of onboarding. To get there we need
// billing to already be active, so we set the billing account row directly
// (skipping the real Stripe trial flow — that's covered separately).

test.describe("Onboarding · Website scrape", () => {
  test("submitting a URL kicks off a scrape and advances", async ({
    page,
    testUser,
  }) => {
    await loginAs(page, testUser);
    const { orgId } = await createOrgAndAdvanceToTrial(page);

    // Mark billing as active so the state machine routes us past /trial.
    const db = serviceClient();
    await db.from("organization_billing_accounts").upsert({
      organization_id: orgId,
      stripe_customer_id: `cus_e2e_${orgId}`,
      internal_plan_status: "trialing",
    });

    await page.goto(`/onboarding/${orgId}/website`);
    await expect(page).toHaveURL(/\/onboarding\/.+\/website/);

    await page.getByPlaceholder(/yourcompany\.com/i).fill("https://example.com");
    await page.getByRole("button", { name: /continue/i }).click();

    // The form posts to /api/onboarding/scrape which inserts a pending row
    // and redirects to /wizard?scrapeId=<id>.
    await page.waitForURL(/\/onboarding\/.+\/wizard\?scrapeId=/, {
      timeout: 20_000,
    });

    // With SCRAPE_MOCK_FIXTURES=1 the background job marks the row complete
    // within ~250ms. Poll the DB rather than the UI so this test doesn't
    // depend on the wizard page's specific layout.
    const url = new URL(page.url());
    const scrapeId = url.searchParams.get("scrapeId");
    expect(scrapeId).toBeTruthy();

    let status: string | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await db
        .from("org_onboarding_scrapes")
        .select("status")
        .eq("id", scrapeId!)
        .maybeSingle();
      status = (data?.status as string) ?? null;
      if (status === "complete" || status === "failed") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(status).toBe("complete");
  });
});
