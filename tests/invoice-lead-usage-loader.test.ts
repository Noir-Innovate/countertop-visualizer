import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDedupedUninvoicedUsageForInvoicePeriod } from "@/lib/invoice-lead-usage-loader";
import {
  runLeadUsageBillingService,
  type LeadBillingServiceDeps,
} from "@/lib/lead-billing-service";
import type { BillingUsageRowWithLead } from "@/lib/lead-billing-identity";

/** Minimal chain matching `fetchDedupedUninvoicedUsageForInvoicePeriod` query shape. */
function createMockSupabase(rows: BillingUsageRowWithLead[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            eq: () => ({
              gte: () => ({
                lt: async () => ({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

test("fetchDedupedUninvoicedUsageForInvoicePeriod collapses duplicate phone to one billable row", async () => {
  const rows: BillingUsageRowWithLead[] = [
    {
      id: "u1",
      lead_id: "l1",
      billed_amount_cents: 5000,
      occurred_at: "2026-01-01T12:00:00.000Z",
      leads: { phone: "+15550001", email: null },
    },
    {
      id: "u2",
      lead_id: "l2",
      billed_amount_cents: 5000,
      occurred_at: "2026-01-15T12:00:00.000Z",
      leads: { phone: "+15550001", email: null },
    },
    {
      id: "u3",
      lead_id: "l3",
      billed_amount_cents: 5000,
      occurred_at: "2026-01-20T12:00:00.000Z",
      leads: { phone: "+15550001", email: null },
    },
  ];
  const supabase = createMockSupabase(rows);
  const out = await fetchDedupedUninvoicedUsageForInvoicePeriod(
    supabase,
    "org-1",
    "2026-01-01T00:00:00.000Z",
    "2026-02-01T00:00:00.000Z",
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].billedAmountCents, 5000);
  assert.equal(out[0].id, "u1");
});

test("runLeadUsageBillingService with loader bills unique amount only (cron-equivalent path)", async () => {
  const rows: BillingUsageRowWithLead[] = [
    {
      id: "u1",
      lead_id: "l1",
      billed_amount_cents: 5000,
      occurred_at: "2026-01-01T12:00:00.000Z",
      leads: { phone: "+1", email: "same@x.com" },
    },
    {
      id: "u2",
      lead_id: "l2",
      billed_amount_cents: 5000,
      occurred_at: "2026-01-10T12:00:00.000Z",
      leads: { phone: "+1", email: "same@x.com" },
    },
  ];
  const supabase = createMockSupabase(rows);

  const deps: LeadBillingServiceDeps = {
    loadBillingAccounts: async () => [
      { organizationId: "org-1", stripeCustomerId: "cus_123" },
    ],
    loadUninvoicedUsageRows: async (organizationId, periodStartIso, periodEndIso) =>
      fetchDedupedUninvoicedUsageForInvoicePeriod(
        supabase,
        organizationId,
        periodStartIso,
        periodEndIso,
      ),
    createStripeInvoiceItem: async ({ amountCents, usageCount }) => {
      assert.equal(amountCents, 5000);
      assert.equal(usageCount, 1);
    },
    createStripeDraftInvoice: async () => ({ invoiceId: "in_draft_1" }),
    finalizeStripeInvoice: async () => ({
      invoiceId: "in_final_1",
      invoiceStatus: "paid",
      paidAtIso: "2026-02-01T00:00:00.000Z",
    }),
    markUsageRowsInvoiced: async () => {},
  };

  const result = await runLeadUsageBillingService(deps, {
    periodStartIso: "2026-01-01T00:00:00.000Z",
    periodEndIso: "2026-02-01T00:00:00.000Z",
    dryRun: false,
  });

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].skipped, false);
  assert.equal(result.results[0].usageCount, 1);
  assert.equal(result.results[0].amountCents, 5000);
});
