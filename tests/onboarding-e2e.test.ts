/**
 * End-to-end onboarding walk-through.
 *
 * Drives the full funnel — signup → org → trial → website scrape → wizard
 * finalize → done — using a single in-memory MockSupabase. External services
 * (FireCrawl, Stripe, Sharp/storage) are not exercised; instead we mutate
 * mock tables in the same way each route handler would, and assert the
 * state machine + referral side-effects line up at every step.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  getOnboardingNextStep,
  getUserOnboardingEntry,
} from "@/lib/onboarding-state";
import {
  activateReferralForOrg,
  attributeReferral,
  ensureReferralCodeForProfile,
  recordCommissionForInvoice,
} from "@/lib/referrals";

interface OrgRow {
  id: string;
  slug: string;
  name: string;
}
interface MemberRow {
  organization_id: string;
  profile_id: string;
  role: string;
}
interface ProfileRow {
  id: string;
  full_name?: string | null;
  email?: string | null;
}
interface BillingRow {
  organization_id: string;
  internal_plan_status: string;
}
interface ScrapeRow {
  id: string;
  organization_id: string;
  status: string;
  created_at: string;
}
interface MaterialLineRow {
  id: string;
  organization_id: string;
  line_kind: string;
}
interface ProfileCodeRow {
  profile_id: string;
  code: string;
}
interface ReferralRow {
  id: string;
  referrer_profile_id: string;
  referee_organization_id: string;
  referee_profile_id: string;
  referee_email: string;
  status: string;
  activated_at?: string | null;
}
interface CommissionRow {
  referral_id: string;
  referrer_profile_id: string;
  referee_organization_id: string;
  stripe_invoice_id: string;
  invoice_amount_cents: number;
  commission_amount_cents: number;
  commission_rate_bps: number;
}

class MockDB {
  organizations: OrgRow[] = [];
  members: MemberRow[] = [];
  profiles: ProfileRow[] = [];
  billingAccounts: BillingRow[] = [];
  scrapes: ScrapeRow[] = [];
  materialLines: MaterialLineRow[] = [];
  profileCodes: ProfileCodeRow[] = [];
  referrals: ReferralRow[] = [];
  commissions: CommissionRow[] = [];

  from(table: string): unknown {
    switch (table) {
      case "organization_billing_accounts":
        return billingAccountsApi(this);
      case "material_lines":
        return materialLinesApi(this);
      case "org_onboarding_scrapes":
        return scrapesApi(this);
      case "organization_members":
        return membersApi(this);
      case "profiles":
        return profilesApi(this);
      case "profile_referral_codes":
        return profileCodesApi(this);
      case "referrals":
        return referralsApi(this);
      case "referral_commissions":
        return commissionsApi(this);
      default:
        throw new Error(`Unhandled table in mock: ${table}`);
    }
  }
}

function billingAccountsApi(db: MockDB) {
  return {
    select: () => ({
      eq: (_col: string, value: string) => ({
        maybeSingle: async () => {
          const row = db.billingAccounts.find(
            (r) => r.organization_id === value,
          );
          return {
            data: row
              ? { internal_plan_status: row.internal_plan_status }
              : null,
          };
        },
      }),
    }),
  };
}

function materialLinesApi(db: MockDB) {
  return {
    select: () => ({
      eq: (_col: string, orgId: string) => ({
        eq: (_col2: string, kind: string) => ({
          then: (resolve: (v: { count: number }) => void) => {
            const count = db.materialLines.filter(
              (m) => m.organization_id === orgId && m.line_kind === kind,
            ).length;
            resolve({ count });
          },
        }),
      }),
    }),
  };
}

function scrapesApi(db: MockDB) {
  return {
    select: () => ({
      eq: (_col: string, orgId: string) => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => {
              const rows = db.scrapes
                .filter((s) => s.organization_id === orgId)
                .sort((a, b) => b.created_at.localeCompare(a.created_at));
              const row = rows[0] ?? null;
              return {
                data: row ? { id: row.id, status: row.status } : null,
              };
            },
          }),
        }),
      }),
    }),
  };
}

function membersApi(db: MockDB) {
  return {
    select: () => ({
      eq: (col: string, value: string) => {
        if (col === "profile_id") {
          const data = db.members
            .filter((m) => m.profile_id === value)
            .map((m) => ({ organization_id: m.organization_id }));
          return {
            then: (
              resolve: (v: { data: { organization_id: string }[] }) => void,
            ) => resolve({ data }),
          };
        }
        throw new Error(`members.eq unhandled col: ${col}`);
      },
    }),
  };
}

function profilesApi(db: MockDB) {
  return {
    select: () => ({
      eq: (_col: string, value: string) => ({
        maybeSingle: async () => {
          const p = db.profiles.find((x) => x.id === value);
          return { data: p ? { email: p.email ?? null } : null };
        },
      }),
    }),
  };
}

function profileCodesApi(db: MockDB) {
  return {
    select: (cols: string) => ({
      eq: (col: string, value: string) => ({
        maybeSingle: async () => {
          if (col === "profile_id") {
            const row = db.profileCodes.find((r) => r.profile_id === value);
            return row ? { data: { code: row.code } } : { data: null };
          }
          if (col === "code") {
            const row = db.profileCodes.find((r) => r.code === value);
            if (!row) return { data: null };
            const profile = db.profiles.find((p) => p.id === row.profile_id);
            if (cols.includes("profiles")) {
              return {
                data: {
                  profile_id: row.profile_id,
                  profiles: profile
                    ? {
                        full_name: profile.full_name ?? null,
                        email: profile.email ?? null,
                      }
                    : null,
                },
              };
            }
            return { data: { profile_id: row.profile_id } };
          }
          throw new Error(`profile_referral_codes.eq unhandled col: ${col}`);
        },
      }),
    }),
    insert: (row: ProfileCodeRow) => ({
      select: () => ({
        single: async () => {
          if (db.profileCodes.some((r) => r.code === row.code)) {
            return { data: null, error: { code: "23505", message: "dup" } };
          }
          if (db.profileCodes.some((r) => r.profile_id === row.profile_id)) {
            return {
              data: null,
              error: { code: "23505", message: "dup profile" },
            };
          }
          db.profileCodes.push(row);
          return { data: { code: row.code }, error: null };
        },
      }),
    }),
  };
}

function referralsApi(db: MockDB) {
  return {
    select: () => ({
      eq: (_col: string, value: string) => ({
        maybeSingle: async () => {
          const row = db.referrals.find(
            (r) => r.referee_organization_id === value,
          );
          if (!row) return { data: null };
          return {
            data: {
              id: row.id,
              referrer_profile_id: row.referrer_profile_id,
              referee_organization_id: row.referee_organization_id,
            },
          };
        },
      }),
    }),
    insert: (row: Omit<ReferralRow, "id">) => ({
      select: () => ({
        single: async () => {
          if (
            db.referrals.some(
              (r) => r.referee_organization_id === row.referee_organization_id,
            )
          ) {
            return { data: null, error: { code: "23505", message: "dup" } };
          }
          const id = `ref-${db.referrals.length + 1}`;
          db.referrals.push({ ...row, id });
          return { data: { id }, error: null };
        },
      }),
    }),
    update: (patch: Partial<ReferralRow>) => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => {
          db.referrals.forEach((r) => {
            const m1 = (r as any)[col1] === val1;
            const m2 = (r as any)[col2] === val2;
            if (m1 && m2) Object.assign(r, patch);
          });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
}

function commissionsApi(db: MockDB) {
  return {
    insert: (row: CommissionRow) => {
      if (
        db.commissions.some(
          (c) => c.stripe_invoice_id === row.stripe_invoice_id,
        )
      ) {
        return Promise.resolve({ error: { code: "23505", message: "dup" } });
      }
      db.commissions.push(row);
      return Promise.resolve({ error: null });
    },
  };
}

const asClient = (db: MockDB) =>
  db as unknown as { from: (t: string) => unknown };

// --- The walk-through ------------------------------------------------------

test("e2e: referrer mints code, referee walks full onboarding, commission accrues", async () => {
  const db = new MockDB();

  // === Setup: an existing person becomes a referrer (no org needed) ===
  db.profiles.push({
    id: "user-referrer",
    full_name: "Referrer Pro",
    email: "owner@referrer.test",
  });

  const { code } = await ensureReferralCodeForProfile(
    "user-referrer",
    asClient(db),
  );
  assert.match(code, /^[A-Z0-9]{8}$/);

  // === Step 0: brand-new referee user, no orgs → needs_org ===
  const refereeUserId = "user-referee";
  db.profiles.push({
    id: refereeUserId,
    full_name: "Referee Buyer",
    email: "buyer@referee.test",
  });
  let entry = await getUserOnboardingEntry(refereeUserId, asClient(db));
  assert.ok(entry);
  assert.equal(entry!.step, "needs_org");
  assert.equal(entry!.url, "/dashboard/organizations/new");

  // === Step 1: referee creates an org and we attribute the referral ===
  const refereeOrg: OrgRow = {
    id: "org-referee",
    slug: "referee-co",
    name: "Referee Co",
  };
  db.organizations.push(refereeOrg);
  db.members.push({
    organization_id: refereeOrg.id,
    profile_id: refereeUserId,
    role: "owner",
  });

  const attribution = await attributeReferral(
    {
      refereeOrgId: refereeOrg.id,
      refereeProfileId: refereeUserId,
      refereeEmail: "buyer@referee.test",
      code,
    },
    asClient(db),
  );
  assert.ok("referralId" in attribution, "referral attribution should succeed");
  assert.equal(db.referrals.length, 1);
  assert.equal(db.referrals[0].status, "pending");
  assert.equal(db.referrals[0].referrer_profile_id, "user-referrer");

  entry = await getUserOnboardingEntry(refereeUserId, asClient(db));
  assert.equal(entry!.step, "needs_billing");
  assert.equal(entry!.url, `/onboarding/${refereeOrg.id}/trial`);

  // === Step 2: referee starts trial → billing webhook activates referral ===
  db.billingAccounts.push({
    organization_id: refereeOrg.id,
    internal_plan_status: "trialing",
  });
  await activateReferralForOrg(refereeOrg.id, asClient(db));
  assert.equal(db.referrals[0].status, "active");
  assert.ok(db.referrals[0].activated_at);

  let nextStep = await getOnboardingNextStep(refereeOrg.id, asClient(db));
  assert.equal(nextStep.step, "needs_website");

  // === Step 3: referee submits website URL → scrape row created (pending) ===
  db.scrapes.push({
    id: "scrape-1",
    organization_id: refereeOrg.id,
    status: "pending",
    created_at: new Date().toISOString(),
  });
  nextStep = await getOnboardingNextStep(refereeOrg.id, asClient(db));
  assert.equal(nextStep.step, "needs_wizard");
  assert.equal(nextStep.scrapeId, "scrape-1");

  // === Step 4: scrape completes ===
  db.scrapes[0].status = "ready";
  nextStep = await getOnboardingNextStep(refereeOrg.id, asClient(db));
  assert.equal(nextStep.step, "needs_wizard");

  // === Step 5: wizard finalize creates the internal material line ===
  db.materialLines.push({
    id: "ml-referee",
    organization_id: refereeOrg.id,
    line_kind: "internal",
  });
  db.scrapes[0].status = "complete";

  nextStep = await getOnboardingNextStep(refereeOrg.id, asClient(db));
  assert.equal(nextStep.step, "done");

  entry = await getUserOnboardingEntry(refereeUserId, asClient(db));
  assert.equal(entry!.step, "done");
  assert.equal(entry!.url, `/dashboard/organizations/${refereeOrg.id}`);

  // === Step 6: first paid invoice → commission accrues for referrer ===
  await recordCommissionForInvoice(
    {
      refereeOrgId: refereeOrg.id,
      stripeInvoiceId: "in_test_001",
      invoiceAmountCents: 5000,
    },
    asClient(db),
  );
  assert.equal(db.commissions.length, 1);
  assert.equal(db.commissions[0].referrer_profile_id, "user-referrer");
  assert.equal(db.commissions[0].commission_amount_cents, 2000); // 40% of 5000

  // Idempotent webhook replay: same invoice id should be a no-op.
  await recordCommissionForInvoice(
    {
      refereeOrgId: refereeOrg.id,
      stripeInvoiceId: "in_test_001",
      invoiceAmountCents: 5000,
    },
    asClient(db),
  );
  assert.equal(db.commissions.length, 1);
});

test("e2e: organic signup (no referral code) still walks to done", async () => {
  const db = new MockDB();

  const userId = "user-organic";
  db.profiles.push({
    id: userId,
    full_name: "Organic User",
    email: "self@organic.test",
  });
  let entry = await getUserOnboardingEntry(userId, asClient(db));
  assert.equal(entry!.step, "needs_org");

  const org: OrgRow = {
    id: "org-organic",
    slug: "organic-co",
    name: "Organic Co",
  };
  db.organizations.push(org);
  db.members.push({
    organization_id: org.id,
    profile_id: userId,
    role: "owner",
  });

  entry = await getUserOnboardingEntry(userId, asClient(db));
  assert.equal(entry!.step, "needs_billing");

  db.billingAccounts.push({
    organization_id: org.id,
    internal_plan_status: "trialing",
  });
  db.scrapes.push({
    id: "scrape-org",
    organization_id: org.id,
    status: "ready",
    created_at: new Date().toISOString(),
  });
  db.materialLines.push({
    id: "ml-organic",
    organization_id: org.id,
    line_kind: "internal",
  });

  entry = await getUserOnboardingEntry(userId, asClient(db));
  assert.equal(entry!.step, "done");
  assert.equal(db.referrals.length, 0);
  assert.equal(db.commissions.length, 0);
});
