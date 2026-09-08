import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyProspectRows,
  summarizeOutcomes,
} from "@/lib/outbound-import";

const PROV = {
  source_url: "https://directory.example.com/acme",
  sourced_at: "2026-09-01T00:00:00Z",
};

function row(over: Record<string, string>): Record<string, string> {
  return { email: "a@x.com", ...PROV, ...over };
}

test("valid row with provenance is imported and mapped", () => {
  const { results, toInsert } = classifyProspectRows(
    [
      row({
        email: "Jane@Acme.com",
        company: "Acme",
        name: "Jane",
        tier: "a",
        segment: "COLD",
        website: "acme.com",
      }),
    ],
    { suppressed: new Set(), existing: new Set() },
  );
  assert.equal(results[0].outcome, "imported");
  assert.equal(toInsert.length, 1);
  assert.equal(toInsert[0].email, "jane@acme.com"); // normalised
  assert.equal(toInsert[0].tier, "A"); // coerced
  assert.equal(toInsert[0].segment, "cold"); // coerced
  assert.equal(toInsert[0].company, "Acme");
});

test("missing provenance is rejected, not defaulted", () => {
  const noUrl = classifyProspectRows(
    [row({ email: "b@x.com", source_url: "" })],
    { suppressed: new Set(), existing: new Set() },
  );
  assert.equal(noUrl.results[0].outcome, "rejected_no_provenance");
  assert.equal(noUrl.toInsert.length, 0);

  const badDate = classifyProspectRows(
    [row({ email: "c@x.com", sourced_at: "not-a-date" })],
    { suppressed: new Set(), existing: new Set() },
  );
  assert.equal(badDate.results[0].outcome, "rejected_no_provenance");
});

test("invalid email is rejected", () => {
  const { results } = classifyProspectRows(
    [row({ email: "not-an-email" }), row({ email: "" })],
    { suppressed: new Set(), existing: new Set() },
  );
  assert.equal(results[0].outcome, "rejected_invalid_email");
  assert.equal(results[1].outcome, "rejected_invalid_email");
});

test("suppressed and existing emails are skipped", () => {
  const { results, toInsert } = classifyProspectRows(
    [row({ email: "sup@x.com" }), row({ email: "dupe@x.com" })],
    {
      suppressed: new Set(["sup@x.com"]),
      existing: new Set(["dupe@x.com"]),
    },
  );
  assert.equal(results[0].outcome, "suppressed");
  assert.equal(results[1].outcome, "duplicate");
  assert.equal(toInsert.length, 0);
});

test("same email twice in one file: second is a duplicate (idempotent)", () => {
  const { results, toInsert } = classifyProspectRows(
    [row({ email: "twice@x.com" }), row({ email: "Twice@X.com" })],
    { suppressed: new Set(), existing: new Set() },
  );
  assert.equal(results[0].outcome, "imported");
  assert.equal(results[1].outcome, "duplicate");
  assert.equal(toInsert.length, 1);
});

test("summary counts each outcome", () => {
  const { results } = classifyProspectRows(
    [
      row({ email: "ok@x.com" }),
      row({ email: "sup@x.com" }),
      row({ email: "bad", source_url: "" }),
    ],
    { suppressed: new Set(["sup@x.com"]), existing: new Set() },
  );
  const s = summarizeOutcomes(results);
  assert.equal(s.imported, 1);
  assert.equal(s.suppressed, 1);
  assert.equal(s.rejected_invalid_email, 1);
});
