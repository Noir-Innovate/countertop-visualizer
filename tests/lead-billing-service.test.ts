import test from "node:test";
import assert from "node:assert/strict";
import {
  runLeadUsageBillingService,
  type LeadBillingServiceDeps,
} from "@/lib/lead-billing-service";

/** `loadUninvoicedUsageRows` should return one row per billable identity (deduped by email/phone in production). */
function buildDeps(
  overrides?: Partial<LeadBillingServiceDeps>,
): LeadBillingServiceDeps {
  return {
    loadBillingAccounts: async () => [
      { organizationId: "org-1", stripeCustomerId: "cus_123" },
    ],
    loadUninvoicedUsageRows: async () => [],
    createStripeInvoiceItem: async () => {},
    createStripeDraftInvoice: async () => ({ invoiceId: "in_draft_1" }),
    finalizeStripeInvoice: async () => ({
      invoiceId: "in_final_1",
      invoiceStatus: "open",
      paidAtIso: null,
    }),
    markUsageRowsInvoiced: async () => {},
    ...overrides,
  };
}

test("service skips org with no uninvoiced usage", async () => {
  const result = await runLeadUsageBillingService(
    buildDeps({
      loadUninvoicedUsageRows: async () => [],
    }),
    {
      periodStartIso: "2026-02-01T00:00:00.000Z",
      periodEndIso: "2026-03-01T00:00:00.000Z",
    },
  );

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].skipped, true);
  assert.equal(result.results[0].reason, "No uninvoiced usage for period");
});

test("service computes amount and creates invoice in non-dry mode", async () => {
  let invoiceItemCalled = false;
  let markInvoicedCalled = false;
  let draftInvoiceIdUsed: string | null = null;

  const result = await runLeadUsageBillingService(
    buildDeps({
      loadUninvoicedUsageRows: async () => [
        { id: "u1", billedAmountCents: 5000 },
        { id: "u2", billedAmountCents: 7500 },
      ],
      createStripeInvoiceItem: async ({ amountCents, invoiceId }) => {
        invoiceItemCalled = true;
        assert.equal(amountCents, 12500);
        draftInvoiceIdUsed = invoiceId;
      },
      markUsageRowsInvoiced: async () => {
        markInvoicedCalled = true;
      },
    }),
    {
      periodStartIso: "2026-02-01T00:00:00.000Z",
      periodEndIso: "2026-03-01T00:00:00.000Z",
      dryRun: false,
    },
  );

  assert.equal(invoiceItemCalled, true);
  assert.equal(draftInvoiceIdUsed, "in_draft_1");
  assert.equal(markInvoicedCalled, true);
  assert.equal(result.results[0].skipped, false);
  assert.equal(result.results[0].amountCents, 12500);
  assert.equal(result.results[0].invoiceId, "in_final_1");
});

test("service does not create invoices in dry run", async () => {
  let invoiceItemCalled = false;

  const result = await runLeadUsageBillingService(
    buildDeps({
      loadUninvoicedUsageRows: async () => [
        { id: "u1", billedAmountCents: 5000 },
      ],
      createStripeInvoiceItem: async () => {
        invoiceItemCalled = true;
      },
    }),
    {
      periodStartIso: "2026-02-01T00:00:00.000Z",
      periodEndIso: "2026-03-01T00:00:00.000Z",
      dryRun: true,
    },
  );

  assert.equal(invoiceItemCalled, false);
  assert.equal(result.results[0].skipped, true);
  assert.equal(result.results[0].reason, "dryRun");
});
