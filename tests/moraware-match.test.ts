import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  addressKey,
  emailsMatch,
  addressesMatch,
  leadMatchesJob,
  LeadIndex,
} from "@/lib/moraware/match";

test("normalizeEmail trims + lowercases", () => {
  assert.equal(normalizeEmail("  Jane@Acme.COM "), "jane@acme.com");
  assert.equal(normalizeEmail(null), "");
});

test("addressKey: street line only, suffix collapse, requires a number", () => {
  assert.equal(addressKey("123 Main Street, Oklahoma City, OK 73170"), "123 main st");
  assert.equal(addressKey("123 Main St"), "123 main st");
  assert.equal(addressKey("123 North Main Avenue"), "123 n main ave");
  // unit tokens dropped
  assert.equal(addressKey("123 Main St Apt 4"), "123 main st 4");
  // no leading number -> not a usable key
  assert.equal(addressKey("Oklahoma City, OK"), "");
  assert.equal(addressKey(""), "");
  assert.equal(addressKey(null), "");
});

test("emailsMatch: exact on normalised form, empty never matches", () => {
  assert.equal(emailsMatch("A@b.com", "a@b.com "), true);
  assert.equal(emailsMatch("a@b.com", "c@d.com"), false);
  assert.equal(emailsMatch(null, null), false);
  assert.equal(emailsMatch("", ""), false);
});

test("addressesMatch: same street matches across city/zip + suffix formatting", () => {
  assert.equal(
    addressesMatch("123 Main St, OKC, OK 73170", "123 Main Street, Moore OK"),
    true,
  );
  assert.equal(addressesMatch("123 Main St", "456 Main St"), false);
  assert.equal(addressesMatch("Oklahoma City", "Oklahoma City"), false); // no number
  assert.equal(addressesMatch(null, "123 Main St"), false);
});

test("leadMatchesJob: broad — email OR address is enough", () => {
  const lead = { id: "l1", email: "jane@acme.com", address: "123 Main St, OKC" };
  // email only
  assert.equal(
    leadMatchesJob(lead, { jobId: "j", email: "JANE@acme.com", address: "9 Elm" }),
    true,
  );
  // address only
  assert.equal(
    leadMatchesJob(lead, { jobId: "j", email: "other@x.com", address: "123 Main Street, Moore" }),
    true,
  );
  // neither
  assert.equal(
    leadMatchesJob(lead, { jobId: "j", email: "other@x.com", address: "9 Elm" }),
    false,
  );
});

test("LeadIndex matches a job to all leads sharing its email or address", () => {
  const idx = new LeadIndex([
    { id: "a", email: "jane@acme.com", address: "123 Main St, OKC" },
    { id: "b", email: "bob@x.com", address: "123 Main Street, Moore" }, // same street
    { id: "c", email: "carol@y.com", address: "500 Oak Ave" },
  ]);
  const m = idx.matches({ jobId: "j", email: "JANE@ACME.com", address: "123 main st" });
  const ids = m.map((l) => l.id).sort();
  // jane by email, a+b by address (same street key)
  assert.deepEqual(ids, ["a", "b"]);
});
