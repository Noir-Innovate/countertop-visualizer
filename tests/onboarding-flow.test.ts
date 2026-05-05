import test from "node:test";
import assert from "node:assert/strict";
import {
  getOnboardingNextStep,
  getUserOnboardingEntry,
  onboardingStepUrl,
} from "@/lib/onboarding-state";

interface TableState {
  organization_billing_accounts?: { internal_plan_status: string } | null;
  material_lines_internal_count?: number;
  org_onboarding_scrapes?: { id: string; status: string } | null;
  organization_members?: { organization_id: string }[];
}

class MockSupabase {
  constructor(private state: TableState) {}

  from(table: string) {
    const state = this.state;

    if (table === "organization_billing_accounts") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.organization_billing_accounts ?? null,
            }),
          }),
        }),
      };
    }

    if (table === "material_lines") {
      const finalThenable = {
        then: (resolve: (v: { count: number }) => void) =>
          resolve({ count: state.material_lines_internal_count ?? 0 }),
      };
      return {
        select: () => ({
          eq: () => ({
            eq: () => finalThenable,
          }),
        }),
      };
    }

    if (table === "org_onboarding_scrapes") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: state.org_onboarding_scrapes ?? null,
                }),
              }),
            }),
          }),
        }),
      };
    }

    if (table === "organization_members") {
      const thenable = {
        then: (resolve: (v: { data: { organization_id: string }[] }) => void) =>
          resolve({ data: state.organization_members ?? [] }),
      };
      return {
        select: () => ({
          eq: () => thenable,
        }),
      };
    }

    throw new Error(`Unhandled table in mock: ${table}`);
  }
}

const asClient = (m: MockSupabase) =>
  m as unknown as { from: (table: string) => unknown };

// ---------- onboardingStepUrl ----------

test("onboardingStepUrl maps each step to the right URL", () => {
  assert.equal(
    onboardingStepUrl("org-1", { step: "needs_org", scrapeId: null }),
    "/dashboard/organizations/new",
  );
  assert.equal(
    onboardingStepUrl("org-1", { step: "needs_billing", scrapeId: null }),
    "/onboarding/org-1/trial",
  );
  assert.equal(
    onboardingStepUrl("org-1", { step: "needs_website", scrapeId: null }),
    "/onboarding/org-1/website",
  );
  assert.equal(
    onboardingStepUrl("org-1", { step: "needs_wizard", scrapeId: "scrape-9" }),
    "/onboarding/org-1/wizard?scrapeId=scrape-9",
  );
  // needs_wizard with no scrapeId falls back to website
  assert.equal(
    onboardingStepUrl("org-1", { step: "needs_wizard", scrapeId: null }),
    "/onboarding/org-1/website",
  );
  assert.equal(
    onboardingStepUrl("org-1", { step: "done", scrapeId: null }),
    "/dashboard/organizations/org-1",
  );
});

// ---------- getOnboardingNextStep ----------

test("getOnboardingNextStep: no billing row → needs_billing", async () => {
  const mock = new MockSupabase({
    organization_billing_accounts: null,
  });
  const state = await getOnboardingNextStep("org-1", asClient(mock));
  assert.equal(state.step, "needs_billing");
});

test("getOnboardingNextStep: inactive plan → needs_billing", async () => {
  const mock = new MockSupabase({
    organization_billing_accounts: { internal_plan_status: "inactive" },
  });
  const state = await getOnboardingNextStep("org-1", asClient(mock));
  assert.equal(state.step, "needs_billing");
});

test("getOnboardingNextStep: trialing + no scrape → needs_website", async () => {
  const mock = new MockSupabase({
    organization_billing_accounts: { internal_plan_status: "trialing" },
    material_lines_internal_count: 0,
    org_onboarding_scrapes: null,
  });
  const state = await getOnboardingNextStep("org-1", asClient(mock));
  assert.equal(state.step, "needs_website");
  assert.equal(state.scrapeId, null);
});

test("getOnboardingNextStep: active + scrape exists + no internal line → needs_wizard", async () => {
  const mock = new MockSupabase({
    organization_billing_accounts: { internal_plan_status: "active" },
    material_lines_internal_count: 0,
    org_onboarding_scrapes: { id: "scrape-42", status: "ready" },
  });
  const state = await getOnboardingNextStep("org-1", asClient(mock));
  assert.equal(state.step, "needs_wizard");
  assert.equal(state.scrapeId, "scrape-42");
});

test("getOnboardingNextStep: internal line exists → done", async () => {
  const mock = new MockSupabase({
    organization_billing_accounts: { internal_plan_status: "active" },
    material_lines_internal_count: 1,
  });
  const state = await getOnboardingNextStep("org-1", asClient(mock));
  assert.equal(state.step, "done");
});

test("getOnboardingNextStep: past_due is treated as paying", async () => {
  const mock = new MockSupabase({
    organization_billing_accounts: { internal_plan_status: "past_due" },
    material_lines_internal_count: 0,
    org_onboarding_scrapes: null,
  });
  const state = await getOnboardingNextStep("org-1", asClient(mock));
  assert.equal(state.step, "needs_website");
});

// ---------- getUserOnboardingEntry ----------

test("getUserOnboardingEntry: 0 orgs → needs_org", async () => {
  const mock = new MockSupabase({ organization_members: [] });
  const entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.ok(entry);
  assert.equal(entry!.step, "needs_org");
  assert.equal(entry!.organizationId, null);
  assert.equal(entry!.url, "/dashboard/organizations/new");
});

test("getUserOnboardingEntry: 1 org needing trial → /onboarding/{id}/trial", async () => {
  const mock = new MockSupabase({
    organization_members: [{ organization_id: "org-1" }],
    organization_billing_accounts: null,
  });
  const entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.ok(entry);
  assert.equal(entry!.step, "needs_billing");
  assert.equal(entry!.url, "/onboarding/org-1/trial");
});

test("getUserOnboardingEntry: 1 org done → org dashboard", async () => {
  const mock = new MockSupabase({
    organization_members: [{ organization_id: "org-1" }],
    organization_billing_accounts: { internal_plan_status: "active" },
    material_lines_internal_count: 1,
  });
  const entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.ok(entry);
  assert.equal(entry!.step, "done");
  assert.equal(entry!.url, "/dashboard/organizations/org-1");
});

test("getUserOnboardingEntry: 2+ orgs → null (caller renders list)", async () => {
  const mock = new MockSupabase({
    organization_members: [
      { organization_id: "org-1" },
      { organization_id: "org-2" },
    ],
  });
  const entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.equal(entry, null);
});

// ---------- end-to-end walk through ----------

test("end-to-end: a brand-new user walks the full funnel", async () => {
  // Step 0: just signed up, no orgs
  let mock = new MockSupabase({ organization_members: [] });
  let entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.equal(entry!.url, "/dashboard/organizations/new");

  // Step 1: created org, no billing yet
  mock = new MockSupabase({
    organization_members: [{ organization_id: "org-1" }],
    organization_billing_accounts: null,
  });
  entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.equal(entry!.url, "/onboarding/org-1/trial");

  // Step 2: trial accepted, no scrape yet
  mock = new MockSupabase({
    organization_members: [{ organization_id: "org-1" }],
    organization_billing_accounts: { internal_plan_status: "trialing" },
    material_lines_internal_count: 0,
    org_onboarding_scrapes: null,
  });
  entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.equal(entry!.url, "/onboarding/org-1/website");

  // Step 3: scrape submitted, wizard not finalized
  mock = new MockSupabase({
    organization_members: [{ organization_id: "org-1" }],
    organization_billing_accounts: { internal_plan_status: "trialing" },
    material_lines_internal_count: 0,
    org_onboarding_scrapes: { id: "scr-1", status: "ready" },
  });
  entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.equal(entry!.url, "/onboarding/org-1/wizard?scrapeId=scr-1");

  // Step 4: finalized, internal material line exists
  mock = new MockSupabase({
    organization_members: [{ organization_id: "org-1" }],
    organization_billing_accounts: { internal_plan_status: "trialing" },
    material_lines_internal_count: 1,
  });
  entry = await getUserOnboardingEntry("user-1", asClient(mock));
  assert.equal(entry!.url, "/dashboard/organizations/org-1");
  assert.equal(entry!.step, "done");
});
