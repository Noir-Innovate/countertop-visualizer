import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  partitionRecipientsBySuppression,
} from "@/lib/email-suppression";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
  assert.equal(normalizeEmail("already@ok.com"), "already@ok.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(undefined), "");
});

test("suppression matches regardless of case/whitespace", () => {
  const suppressed = new Set(["blocked@x.com"]);
  const { allowed, suppressed: hit } = partitionRecipientsBySuppression(
    ["  Blocked@X.com ", "fine@y.com"],
    suppressed,
  );
  assert.deepEqual(hit, ["  Blocked@X.com "]);
  assert.deepEqual(allowed, ["fine@y.com"]);
});

test("all-suppressed leaves no allowed recipients", () => {
  const suppressed = new Set(["a@x.com", "b@x.com"]);
  const { allowed, suppressed: hit } = partitionRecipientsBySuppression(
    ["A@X.com", "b@x.com"],
    suppressed,
  );
  assert.equal(allowed.length, 0);
  assert.equal(hit.length, 2);
});

test("empty suppression set allows everyone", () => {
  const { allowed, suppressed } = partitionRecipientsBySuppression(
    ["a@x.com", "b@y.com"],
    new Set(),
  );
  assert.deepEqual(allowed, ["a@x.com", "b@y.com"]);
  assert.deepEqual(suppressed, []);
});
