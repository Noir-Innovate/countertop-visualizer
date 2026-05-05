import test from "node:test";
import assert from "node:assert/strict";
import {
  activateReferralForOrg,
  attributeReferral,
  ensureReferralCodeForProfile,
  generateReferralCode,
  getCommissionRateBps,
  hasW9OnFile,
  isOrgPaying,
  lookupReferrerByCode,
  recordCommissionForInvoice,
} from "@/lib/referrals";

interface ProfileReferralCodeRow {
  profile_id: string;
  code: string;
}

interface ProfileRow {
  id: string;
  full_name?: string | null;
  email?: string | null;
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

interface BillingAccountRow {
  organization_id: string;
  internal_plan_status: string;
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

interface PayoutProfileRow {
  profile_id: string;
  w9_collected_at: string | null;
}

class MockSupabase {
  profileCodes: ProfileReferralCodeRow[] = [];
  profiles: ProfileRow[] = [];
  referrals: ReferralRow[] = [];
  billingAccounts: BillingAccountRow[] = [];
  commissions: CommissionRow[] = [];
  payoutProfiles: PayoutProfileRow[] = [];

  insertCodeError: { code?: string; message?: string } | null = null;
  insertReferralError: { code?: string; message?: string } | null = null;
  insertCommissionError: { code?: string; message?: string } | null = null;

  insertCodeAttempts = 0;

  from(table: string): any {
    if (table === "organization_billing_accounts") {
      return {
        select: () => ({
          eq: (_col: string, value: string) => ({
            maybeSingle: async () => {
              const row = this.billingAccounts.find(
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

    if (table === "profile_referral_codes") {
      return {
        select: (cols: string) => ({
          eq: (col: string, value: string) => ({
            maybeSingle: async () => {
              if (col === "profile_id") {
                const row = this.profileCodes.find(
                  (r) => r.profile_id === value,
                );
                return row ? { data: { code: row.code } } : { data: null };
              }
              if (col === "code") {
                const row = this.profileCodes.find((r) => r.code === value);
                if (!row) return { data: null };
                const profile = this.profiles.find(
                  (p) => p.id === row.profile_id,
                );
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
              return { data: null };
            },
          }),
        }),
        insert: (row: ProfileReferralCodeRow) => ({
          select: () => ({
            single: async () => {
              this.insertCodeAttempts++;
              if (this.insertCodeError) {
                return { data: null, error: this.insertCodeError };
              }
              if (
                this.profileCodes.some(
                  (r) =>
                    r.code === row.code || r.profile_id === row.profile_id,
                )
              ) {
                return {
                  data: null,
                  error: { code: "23505", message: "duplicate" },
                };
              }
              this.profileCodes.push(row);
              return { data: { code: row.code }, error: null };
            },
          }),
        }),
      };
    }

    if (table === "profiles") {
      return {
        select: () => ({
          eq: (_col: string, value: string) => ({
            maybeSingle: async () => {
              const p = this.profiles.find((x) => x.id === value);
              return { data: p ? { email: p.email ?? null } : null };
            },
          }),
        }),
      };
    }

    if (table === "referrals") {
      return {
        select: () => ({
          eq: (_col: string, value: string) => ({
            maybeSingle: async () => {
              const row = this.referrals.find(
                (r) => r.referee_organization_id === value,
              );
              return { data: row ?? null };
            },
          }),
        }),
        insert: (row: Omit<ReferralRow, "id">) => ({
          select: () => ({
            single: async () => {
              if (this.insertReferralError) {
                return { data: null, error: this.insertReferralError };
              }
              if (
                this.referrals.some(
                  (r) =>
                    r.referee_organization_id === row.referee_organization_id,
                )
              ) {
                return {
                  data: null,
                  error: { code: "23505", message: "duplicate" },
                };
              }
              const newRow: ReferralRow = {
                ...row,
                id: `ref-${this.referrals.length + 1}`,
              };
              this.referrals.push(newRow);
              return { data: { id: newRow.id }, error: null };
            },
          }),
        }),
        update: (patch: Partial<ReferralRow>) => ({
          eq: (col1: string, value1: string) => ({
            eq: (col2: string, value2: string) => {
              for (const r of this.referrals) {
                if (
                  (r as any)[col1] === value1 &&
                  (r as any)[col2] === value2
                ) {
                  Object.assign(r, patch);
                }
              }
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    }

    if (table === "referral_commissions") {
      return {
        insert: async (row: CommissionRow) => {
          if (this.insertCommissionError) {
            return { error: this.insertCommissionError };
          }
          if (
            this.commissions.some(
              (c) => c.stripe_invoice_id === row.stripe_invoice_id,
            )
          ) {
            return { error: { code: "23505", message: "duplicate invoice" } };
          }
          this.commissions.push(row);
          return { error: null };
        },
      };
    }

    if (table === "referrer_payout_profiles") {
      return {
        select: () => ({
          eq: (_col: string, value: string) => ({
            maybeSingle: async () => {
              const row = this.payoutProfiles.find(
                (p) => p.profile_id === value,
              );
              return {
                data: row
                  ? { w9_collected_at: row.w9_collected_at }
                  : null,
              };
            },
          }),
        }),
      };
    }

    throw new Error(`Unhandled table in mock: ${table}`);
  }
}

const asClient = (m: MockSupabase) =>
  m as unknown as { from: (table: string) => unknown };

// ---------- pure helpers ----------

test("getCommissionRateBps defaults to 4000 (40%)", () => {
  const original = process.env.REFERRAL_COMMISSION_BPS;
  delete process.env.REFERRAL_COMMISSION_BPS;
  assert.equal(getCommissionRateBps(), 4000);
  if (original !== undefined) process.env.REFERRAL_COMMISSION_BPS = original;
});

test("getCommissionRateBps reads override from env", () => {
  const original = process.env.REFERRAL_COMMISSION_BPS;
  process.env.REFERRAL_COMMISSION_BPS = "1500";
  assert.equal(getCommissionRateBps(), 1500);
  if (original === undefined) delete process.env.REFERRAL_COMMISSION_BPS;
  else process.env.REFERRAL_COMMISSION_BPS = original;
});

test("generateReferralCode produces 8 chars from the safe alphabet", () => {
  const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  for (let i = 0; i < 50; i++) {
    const code = generateReferralCode();
    assert.equal(code.length, 8);
    for (const ch of code) {
      assert.ok(ALPHABET.includes(ch), `unexpected char ${ch} in ${code}`);
    }
  }
});

// ---------- isOrgPaying ----------

test("isOrgPaying: trialing/active/past_due all count as paying", async () => {
  for (const status of ["trialing", "active", "past_due"]) {
    const mock = new MockSupabase();
    mock.billingAccounts = [
      { organization_id: "org-1", internal_plan_status: status },
    ];
    assert.equal(await isOrgPaying("org-1", asClient(mock)), true, status);
  }
});

test("isOrgPaying: cancelled / missing → false", async () => {
  const mock = new MockSupabase();
  mock.billingAccounts = [
    { organization_id: "org-1", internal_plan_status: "canceled" },
  ];
  assert.equal(await isOrgPaying("org-1", asClient(mock)), false);
  assert.equal(await isOrgPaying("org-missing", asClient(mock)), false);
});

// ---------- ensureReferralCodeForProfile ----------

test("ensureReferralCodeForProfile returns existing code without inserting", async () => {
  const mock = new MockSupabase();
  mock.profileCodes = [{ profile_id: "user-1", code: "EXISTING1" }];
  const { code } = await ensureReferralCodeForProfile(
    "user-1",
    asClient(mock),
  );
  assert.equal(code, "EXISTING1");
  assert.equal(mock.insertCodeAttempts, 0);
});

test("ensureReferralCodeForProfile mints a new code when none exists", async () => {
  const mock = new MockSupabase();
  const { code } = await ensureReferralCodeForProfile(
    "user-1",
    asClient(mock),
  );
  assert.equal(code.length, 8);
  assert.equal(mock.profileCodes.length, 1);
  assert.equal(mock.profileCodes[0].profile_id, "user-1");
});

// ---------- lookupReferrerByCode ----------

test("lookupReferrerByCode returns null for unknown code", async () => {
  const mock = new MockSupabase();
  const result = await lookupReferrerByCode("NOPE0000", asClient(mock));
  assert.equal(result, null);
});

test("lookupReferrerByCode returns profile id and display name", async () => {
  const mock = new MockSupabase();
  mock.profileCodes = [{ profile_id: "user-1", code: "REFER123" }];
  mock.profiles = [
    { id: "user-1", full_name: "Jane Doe", email: "jane@example.com" },
  ];
  const result = await lookupReferrerByCode("REFER123", asClient(mock));
  assert.deepEqual(result, {
    profileId: "user-1",
    displayName: "Jane Doe",
  });
});

test("lookupReferrerByCode falls back to email then 'another customer'", async () => {
  const mock = new MockSupabase();
  mock.profileCodes = [{ profile_id: "user-1", code: "REFER123" }];
  mock.profiles = [{ id: "user-1", full_name: null, email: "x@y.com" }];
  const r1 = await lookupReferrerByCode("REFER123", asClient(mock));
  assert.equal(r1?.displayName, "x@y.com");

  mock.profiles = [{ id: "user-1", full_name: null, email: null }];
  const r2 = await lookupReferrerByCode("REFER123", asClient(mock));
  assert.equal(r2?.displayName, "another customer");
});

// ---------- attributeReferral ----------

test("attributeReferral: invalid code → invalid_code", async () => {
  const mock = new MockSupabase();
  const result = await attributeReferral(
    {
      refereeOrgId: "org-2",
      refereeProfileId: "user-2",
      refereeEmail: "new@example.com",
      code: "DOESNOEX",
    },
    asClient(mock),
  );
  assert.deepEqual(result, { error: "invalid_code" });
});

test("attributeReferral: self-referral rejected", async () => {
  const mock = new MockSupabase();
  mock.profileCodes = [{ profile_id: "user-1", code: "REFER123" }];
  mock.profiles = [
    { id: "user-1", full_name: "Acme Owner", email: "owner@acme.com" },
  ];
  const result = await attributeReferral(
    {
      refereeOrgId: "org-1",
      refereeProfileId: "user-1",
      refereeEmail: "owner@acme.com",
      code: "REFER123",
    },
    asClient(mock),
  );
  assert.deepEqual(result, { error: "self_referral" });
});

test("attributeReferral: same email as referrer rejected (case-insensitive)", async () => {
  const mock = new MockSupabase();
  mock.profileCodes = [{ profile_id: "user-1", code: "REFER123" }];
  mock.profiles = [
    { id: "user-1", full_name: "Acme Owner", email: "owner@acme.com" },
  ];
  const result = await attributeReferral(
    {
      refereeOrgId: "org-2",
      refereeProfileId: "user-2",
      refereeEmail: "OWNER@acme.com",
      code: "REFER123",
    },
    asClient(mock),
  );
  assert.deepEqual(result, { error: "same_email_as_referrer" });
});

test("attributeReferral: happy path inserts pending referral", async () => {
  const mock = new MockSupabase();
  mock.profileCodes = [{ profile_id: "user-1", code: "REFER123" }];
  mock.profiles = [
    { id: "user-1", full_name: "Acme Owner", email: "owner@acme.com" },
  ];
  const result = await attributeReferral(
    {
      refereeOrgId: "org-2",
      refereeProfileId: "user-2",
      refereeEmail: "new@elsewhere.com",
      code: "REFER123",
    },
    asClient(mock),
  );
  assert.ok("referralId" in result);
  assert.equal(mock.referrals.length, 1);
  assert.equal(mock.referrals[0].status, "pending");
  assert.equal(mock.referrals[0].referrer_profile_id, "user-1");
  assert.equal(mock.referrals[0].referee_organization_id, "org-2");
});

test("attributeReferral: duplicate returns already_referred", async () => {
  const mock = new MockSupabase();
  mock.profileCodes = [{ profile_id: "user-1", code: "REFER123" }];
  mock.profiles = [
    { id: "user-1", full_name: "Acme Owner", email: "owner@acme.com" },
  ];
  mock.referrals = [
    {
      id: "ref-existing",
      referrer_profile_id: "user-1",
      referee_organization_id: "org-2",
      referee_profile_id: "user-2",
      referee_email: "new@elsewhere.com",
      status: "pending",
    },
  ];
  const result = await attributeReferral(
    {
      refereeOrgId: "org-2",
      refereeProfileId: "user-2",
      refereeEmail: "new@elsewhere.com",
      code: "REFER123",
    },
    asClient(mock),
  );
  assert.deepEqual(result, { error: "already_referred" });
});

// ---------- activateReferralForOrg ----------

test("activateReferralForOrg flips pending → active", async () => {
  const mock = new MockSupabase();
  mock.referrals = [
    {
      id: "ref-1",
      referrer_profile_id: "user-1",
      referee_organization_id: "org-2",
      referee_profile_id: "user-2",
      referee_email: "new@elsewhere.com",
      status: "pending",
    },
  ];
  await activateReferralForOrg("org-2", asClient(mock));
  assert.equal(mock.referrals[0].status, "active");
  assert.ok(mock.referrals[0].activated_at);
});

// ---------- recordCommissionForInvoice ----------

test("recordCommissionForInvoice: 40% of $250 invoice → $100 commission", async () => {
  const mock = new MockSupabase();
  mock.referrals = [
    {
      id: "ref-1",
      referrer_profile_id: "user-1",
      referee_organization_id: "org-2",
      referee_profile_id: "user-2",
      referee_email: "new@elsewhere.com",
      status: "active",
    },
  ];
  await recordCommissionForInvoice(
    {
      refereeOrgId: "org-2",
      stripeInvoiceId: "in_test_001",
      invoiceAmountCents: 25000,
    },
    asClient(mock),
  );
  assert.equal(mock.commissions.length, 1);
  assert.equal(mock.commissions[0].commission_amount_cents, 10000);
  assert.equal(mock.commissions[0].commission_rate_bps, 4000);
  assert.equal(mock.commissions[0].invoice_amount_cents, 25000);
  assert.equal(mock.commissions[0].referral_id, "ref-1");
  assert.equal(mock.commissions[0].referrer_profile_id, "user-1");
});

test("recordCommissionForInvoice: idempotent on webhook replay", async () => {
  const mock = new MockSupabase();
  mock.referrals = [
    {
      id: "ref-1",
      referrer_profile_id: "user-1",
      referee_organization_id: "org-2",
      referee_profile_id: "user-2",
      referee_email: "new@elsewhere.com",
      status: "active",
    },
  ];
  const input = {
    refereeOrgId: "org-2",
    stripeInvoiceId: "in_test_dupe",
    invoiceAmountCents: 25000,
  };
  await recordCommissionForInvoice(input, asClient(mock));
  await recordCommissionForInvoice(input, asClient(mock));
  assert.equal(mock.commissions.length, 1);
});

test("recordCommissionForInvoice: no referral → no-op", async () => {
  const mock = new MockSupabase();
  await recordCommissionForInvoice(
    {
      refereeOrgId: "org-no-ref",
      stripeInvoiceId: "in_test_002",
      invoiceAmountCents: 25000,
    },
    asClient(mock),
  );
  assert.equal(mock.commissions.length, 0);
});

test("recordCommissionForInvoice: zero invoice → no-op", async () => {
  const mock = new MockSupabase();
  mock.referrals = [
    {
      id: "ref-1",
      referrer_profile_id: "user-1",
      referee_organization_id: "org-2",
      referee_profile_id: "user-2",
      referee_email: "new@elsewhere.com",
      status: "active",
    },
  ];
  await recordCommissionForInvoice(
    {
      refereeOrgId: "org-2",
      stripeInvoiceId: "in_test_zero",
      invoiceAmountCents: 0,
    },
    asClient(mock),
  );
  assert.equal(mock.commissions.length, 0);
});

test("recordCommissionForInvoice: non-23505 error throws", async () => {
  const mock = new MockSupabase();
  mock.referrals = [
    {
      id: "ref-1",
      referrer_profile_id: "user-1",
      referee_organization_id: "org-2",
      referee_profile_id: "user-2",
      referee_email: "new@elsewhere.com",
      status: "active",
    },
  ];
  mock.insertCommissionError = { code: "42P01", message: "table missing" };
  await assert.rejects(
    recordCommissionForInvoice(
      {
        refereeOrgId: "org-2",
        stripeInvoiceId: "in_test_err",
        invoiceAmountCents: 25000,
      },
      asClient(mock),
    ),
    /table missing/,
  );
});

// ---------- hasW9OnFile ----------

test("hasW9OnFile: false when no row, true when w9_collected_at set", async () => {
  const mock = new MockSupabase();
  assert.equal(await hasW9OnFile("user-1", asClient(mock)), false);

  mock.payoutProfiles = [
    { profile_id: "user-1", w9_collected_at: null },
  ];
  assert.equal(await hasW9OnFile("user-1", asClient(mock)), false);

  mock.payoutProfiles = [
    { profile_id: "user-1", w9_collected_at: new Date().toISOString() },
  ];
  assert.equal(await hasW9OnFile("user-1", asClient(mock)), true);
});

// ---------- end-to-end: full referral lifecycle ----------

test("end-to-end: referrer mints code → referee signs up → activates → invoice → commission", async () => {
  const mock = new MockSupabase();
  mock.profiles = [
    { id: "user-referrer", full_name: "Stone Pro", email: "boss@stonepros.com" },
  ];

  const { code } = await ensureReferralCodeForProfile(
    "user-referrer",
    asClient(mock),
  );
  assert.equal(code.length, 8);

  const attrib = await attributeReferral(
    {
      refereeOrgId: "org-referee",
      refereeProfileId: "user-newbie",
      refereeEmail: "newbie@newshop.com",
      code,
    },
    asClient(mock),
  );
  assert.ok("referralId" in attrib);

  await activateReferralForOrg("org-referee", asClient(mock));
  assert.equal(mock.referrals[0].status, "active");

  await recordCommissionForInvoice(
    {
      refereeOrgId: "org-referee",
      stripeInvoiceId: "in_month_1",
      invoiceAmountCents: 25000,
    },
    asClient(mock),
  );
  await recordCommissionForInvoice(
    {
      refereeOrgId: "org-referee",
      stripeInvoiceId: "in_month_2",
      invoiceAmountCents: 25000,
    },
    asClient(mock),
  );

  assert.equal(mock.commissions.length, 2);
  const totalCommission = mock.commissions.reduce(
    (sum, c) => sum + c.commission_amount_cents,
    0,
  );
  assert.equal(totalCommission, 20000); // $200 = 40% of $500
  assert.equal(mock.commissions[0].referrer_profile_id, "user-referrer");
});
