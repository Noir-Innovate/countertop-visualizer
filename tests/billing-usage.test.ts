import test from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveLeadPriceCents,
  trackLeadBillingUsage,
} from "@/lib/billing-usage";
import { DEFAULT_LEAD_PRICE_CENTS } from "@/lib/billing";

type InsertPayload = Record<string, unknown>;

class MockSupabase {
  public pricingValue: number | null = null;
  public insertError: { code?: string; message?: string } | null = null;
  public insertedRows: InsertPayload[] = [];

  from(table: string) {
    if (table === "organization_billing_pricing") {
      return {
        select: () => ({
          eq: () => ({
            lte: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data:
                      this.pricingValue === null
                        ? null
                        : { lead_price_cents: this.pricingValue },
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }

    if (table === "organization_billing_usage") {
      return {
        insert: async (row: InsertPayload) => {
          this.insertedRows.push(row);
          return { error: this.insertError };
        },
      };
    }

    throw new Error(`Unhandled table in mock: ${table}`);
  }
}

test("getEffectiveLeadPriceCents falls back to default when no pricing row", async () => {
  const mock = new MockSupabase();
  mock.pricingValue = null;

  const price = await getEffectiveLeadPriceCents(
    mock as unknown as { from: (table: string) => any },
    "org-1",
    "2026-03-01T00:00:00.000Z",
  );

  assert.equal(price, DEFAULT_LEAD_PRICE_CENTS);
});

test("trackLeadBillingUsage inserts one billable usage row", async () => {
  const mock = new MockSupabase();
  mock.pricingValue = 6500;

  const result = await trackLeadBillingUsage({
    supabase: mock as unknown as { from: (table: string) => any },
    leadId: "lead-1",
    organizationId: "org-1",
    materialLineId: "line-1",
    occurredAtIso: "2026-02-22T12:00:00.000Z",
  });

  assert.equal(result.tracked, true);
  assert.equal(mock.insertedRows.length, 1);
  assert.equal(mock.insertedRows[0].lead_price_cents, 6500);
  assert.equal(mock.insertedRows[0].billed_amount_cents, 6500);
});

test("trackLeadBillingUsage is idempotent on duplicate lead insert", async () => {
  const mock = new MockSupabase();
  mock.pricingValue = 5000;
  mock.insertError = { code: "23505", message: "duplicate key value" };

  const result = await trackLeadBillingUsage({
    supabase: mock as unknown as { from: (table: string) => any },
    leadId: "lead-duplicate",
    organizationId: "org-1",
    materialLineId: "line-1",
    occurredAtIso: "2026-02-22T12:00:00.000Z",
  });

  assert.equal(result.tracked, true);
  assert.equal(result.duplicate, true);
});
