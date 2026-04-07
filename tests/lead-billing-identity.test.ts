import test from "node:test";
import assert from "node:assert/strict";
import {
  getLeadBillingIdentityKey,
  dedupeBillingUsageRowsForInvoice,
  type BillingUsageRowWithLead,
} from "@/lib/lead-billing-identity";

test("getLeadBillingIdentityKey prefers trimmed phone over email", () => {
  assert.equal(
    getLeadBillingIdentityKey("  +15551234  ", "a@b.com", "lead-1"),
    "+15551234",
  );
});

test("getLeadBillingIdentityKey uses email when phone empty", () => {
  assert.equal(
    getLeadBillingIdentityKey("   ", "  x@y.com ", "lead-1"),
    "x@y.com",
  );
});

test("getLeadBillingIdentityKey falls back to lead id when no phone or email", () => {
  assert.equal(getLeadBillingIdentityKey(null, null, "uuid-a"), "uuid-a");
  assert.equal(getLeadBillingIdentityKey("", "", "uuid-b"), "uuid-b");
});

test("dedupeBillingUsageRowsForInvoice keeps one row per identity (earliest occurred_at)", () => {
  const rows: BillingUsageRowWithLead[] = [
    {
      id: "u1",
      lead_id: "l1",
      billed_amount_cents: 5000,
      occurred_at: "2026-02-15T12:00:00.000Z",
      leads: { email: "a@b.com", phone: "+1" },
    },
    {
      id: "u2",
      lead_id: "l2",
      billed_amount_cents: 5000,
      occurred_at: "2026-02-10T12:00:00.000Z",
      leads: { email: "a@b.com", phone: "+1" },
    },
    {
      id: "u3",
      lead_id: "l3",
      billed_amount_cents: 7500,
      occurred_at: "2026-02-20T12:00:00.000Z",
      leads: { email: "other@b.com", phone: null },
    },
  ];
  const deduped = dedupeBillingUsageRowsForInvoice(rows);
  assert.equal(deduped.length, 2);
  const byPhone = deduped.find((r) => r.id === "u2");
  assert.ok(byPhone);
  assert.equal(byPhone!.billedAmountCents, 5000);
  const byEmail = deduped.find((r) => r.id === "u3");
  assert.ok(byEmail);
  assert.equal(byEmail!.billedAmountCents, 7500);
});

test("dedupeBillingUsageRowsForInvoice uses lead_id when contact missing", () => {
  const rows: BillingUsageRowWithLead[] = [
    {
      id: "u1",
      lead_id: "l1",
      billed_amount_cents: 100,
      occurred_at: "2026-02-01T00:00:00.000Z",
      leads: { email: null, phone: null },
    },
    {
      id: "u2",
      lead_id: "l2",
      billed_amount_cents: 200,
      occurred_at: "2026-02-02T00:00:00.000Z",
      leads: { email: null, phone: null },
    },
  ];
  const deduped = dedupeBillingUsageRowsForInvoice(rows);
  assert.equal(deduped.length, 2);
});
