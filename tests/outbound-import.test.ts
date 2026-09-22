import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyProspectRows,
  summarizeOutcomes,
} from "@/lib/outbound-import";

// A valid row now needs provenance AND the OD-7a tier-input fields the DB marks
// NOT NULL (business_type, tier_rationale).
const BASE: Record<string, string> = {
  email: "a@x.com",
  source_url: "https://directory.example.com/acme",
  sourced_at: "2026-09-01T00:00:00Z",
  business_type: "fabricator",
  tier_rationale: "fabricator serving the trade",
};

function row(over: Record<string, string>): Record<string, string> {
  return { ...BASE, ...over };
}

const clean = { suppressed: new Set<string>(), existing: new Set<string>() };

test("valid row is imported and fully mapped", () => {
  const { results, toInsert } = classifyProspectRows(
    [
      row({
        email: "Jane@Acme.com",
        company: "Acme",
        name: "Jane",
        tier: "a",
        segment: "COLD",
        website: "acme.com",
        business_type: "Stone Yard",
        serves_homeowners: "yes",
        has_showroom: "no",
        employee_count: "42",
        city: "Boise",
        state: "ID",
      }),
    ],
    clean,
  );
  assert.equal(results[0].outcome, "imported");
  const p = toInsert[0];
  assert.equal(p.email, "jane@acme.com"); // normalised
  assert.equal(p.tier, "A"); // coerced
  assert.equal(p.segment, "cold");
  assert.equal(p.business_type, "stone_yard"); // alias resolved
  assert.equal(p.serves_homeowners, true);
  assert.equal(p.has_showroom, false);
  assert.equal(p.employee_count, 42);
  assert.equal(p.city, "Boise");
});

test("tier defaults to 'unknown' when missing/unrecognised (never guessed)", () => {
  const { toInsert } = classifyProspectRows(
    [row({ tier: "" }), row({ email: "b@x.com", tier: "gold" })],
    clean,
  );
  assert.equal(toInsert[0].tier, "unknown");
  assert.equal(toInsert[1].tier, "unknown");
});

test("missing provenance is rejected, not defaulted", () => {
  const noUrl = classifyProspectRows([row({ source_url: "" })], clean);
  assert.equal(noUrl.results[0].outcome, "rejected_no_provenance");
  const badDate = classifyProspectRows(
    [row({ email: "c@x.com", sourced_at: "nope" })],
    clean,
  );
  assert.equal(badDate.results[0].outcome, "rejected_no_provenance");
});

test("invalid email rejected", () => {
  const { results } = classifyProspectRows([row({ email: "bad" })], clean);
  assert.equal(results[0].outcome, "rejected_invalid_email");
});

test("missing or unknown business_type is rejected", () => {
  const missing = classifyProspectRows([row({ business_type: "" })], clean);
  assert.equal(missing.results[0].outcome, "rejected_invalid_business_type");
  const bogus = classifyProspectRows(
    [row({ email: "d@x.com", business_type: "law firm" })],
    clean,
  );
  assert.equal(bogus.results[0].outcome, "rejected_invalid_business_type");
});

test("missing tier_rationale is rejected", () => {
  const { results } = classifyProspectRows(
    [row({ tier_rationale: "" })],
    clean,
  );
  assert.equal(results[0].outcome, "rejected_missing_rationale");
});

test("segment=warm requires a relationship_note", () => {
  const noNote = classifyProspectRows([row({ segment: "warm" })], clean);
  assert.equal(noNote.results[0].outcome, "rejected_warm_no_note");

  const withNote = classifyProspectRows(
    [row({ segment: "warm", relationship_note: "met at KBIS 2025" })],
    clean,
  );
  assert.equal(withNote.results[0].outcome, "imported");
  assert.equal(withNote.toInsert[0].relationship_note, "met at KBIS 2025");
});

test("suppressed, existing, and in-file duplicates are skipped", () => {
  const dupeFile = classifyProspectRows(
    [row({ email: "twice@x.com" }), row({ email: "Twice@X.com" })],
    clean,
  );
  assert.equal(dupeFile.results[0].outcome, "imported");
  assert.equal(dupeFile.results[1].outcome, "duplicate");

  const ctx = {
    suppressed: new Set(["sup@x.com"]),
    existing: new Set(["dupe@x.com"]),
  };
  const { results } = classifyProspectRows(
    [row({ email: "sup@x.com" }), row({ email: "dupe@x.com" })],
    ctx,
  );
  assert.equal(results[0].outcome, "suppressed");
  assert.equal(results[1].outcome, "duplicate");
});

test("summary counts each outcome", () => {
  const { results } = classifyProspectRows(
    [
      row({ email: "ok@x.com" }),
      row({ email: "bad" }),
      row({ email: "e@x.com", business_type: "" }),
    ],
    clean,
  );
  const s = summarizeOutcomes(results);
  assert.equal(s.imported, 1);
  assert.equal(s.rejected_invalid_email, 1);
  assert.equal(s.rejected_invalid_business_type, 1);
});
