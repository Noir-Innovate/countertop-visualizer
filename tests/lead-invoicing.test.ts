import test from "node:test";
import assert from "node:assert/strict";
import {
  getCurrentMonthPeriod,
  getPreviousMonthPeriod,
  buildLeadUsageInvoiceDescription,
} from "@/lib/lead-invoicing";

test("getCurrentMonthPeriod returns UTC month boundaries", () => {
  const reference = new Date("2026-02-15T10:30:00.000Z");
  const period = getCurrentMonthPeriod(reference);
  assert.equal(period.startIso, "2026-02-01T00:00:00.000Z");
  assert.equal(period.endIso, "2026-03-01T00:00:00.000Z");
});

test("getPreviousMonthPeriod returns previous UTC month boundaries", () => {
  const reference = new Date("2026-02-15T10:30:00.000Z");
  const period = getPreviousMonthPeriod(reference);
  assert.equal(period.startIso, "2026-01-01T00:00:00.000Z");
  assert.equal(period.endIso, "2026-02-01T00:00:00.000Z");
});

test("buildLeadUsageInvoiceDescription includes count and period range", () => {
  const description = buildLeadUsageInvoiceDescription({
    usageCount: 12,
    periodStartIso: "2026-01-01T00:00:00.000Z",
    periodEndIso: "2026-02-01T00:00:00.000Z",
  });

  assert.match(description, /Lead usage \(12 leads\) for/);
});
