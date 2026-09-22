import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  resolveMessageClass,
  isBlockedByReason,
  partitionRecipientsBySuppression,
  type SuppressionReason,
} from "@/lib/email-suppression";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(undefined), "");
});

// Fail-closed class resolution: only an explicit "transactional" is lenient.
test("resolveMessageClass: anything not explicitly transactional is commercial", () => {
  assert.equal(resolveMessageClass("transactional"), "transactional");
  assert.equal(resolveMessageClass("commercial"), "commercial");
  assert.equal(resolveMessageClass(undefined), "commercial");
  assert.equal(resolveMessageClass(null), "commercial");
  // @ts-expect-error — a bogus value must still resolve to the strict class
  assert.equal(resolveMessageClass("marketing"), "commercial");
});

// The full policy matrix, every cell.
test("isBlockedByReason matrix (reason x class)", () => {
  // unsubscribed / complaint: commercial only
  assert.equal(isBlockedByReason("unsubscribed", "commercial"), true);
  assert.equal(isBlockedByReason("unsubscribed", "transactional"), false);
  assert.equal(isBlockedByReason("complaint", "commercial"), true);
  assert.equal(isBlockedByReason("complaint", "transactional"), false);
  // hard_bounce / manual: everything
  assert.equal(isBlockedByReason("hard_bounce", "commercial"), true);
  assert.equal(isBlockedByReason("hard_bounce", "transactional"), true);
  assert.equal(isBlockedByReason("manual", "commercial"), true);
  assert.equal(isBlockedByReason("manual", "transactional"), true);
});

function reasons(
  entries: Record<string, SuppressionReason>,
): Map<string, SuppressionReason> {
  return new Map(Object.entries(entries));
}

test("commercial send is blocked by every suppression reason", () => {
  const map = reasons({
    "u@x.com": "unsubscribed",
    "c@x.com": "complaint",
    "b@x.com": "hard_bounce",
    "m@x.com": "manual",
  });
  const { allowed, blocked } = partitionRecipientsBySuppression(
    ["u@x.com", "c@x.com", "b@x.com", "m@x.com", "ok@x.com"],
    map,
    "commercial",
  );
  assert.deepEqual(allowed, ["ok@x.com"]);
  assert.equal(blocked.length, 4);
});

test("transactional send passes opt-outs but not bounce/manual", () => {
  const map = reasons({
    "u@x.com": "unsubscribed",
    "c@x.com": "complaint",
    "b@x.com": "hard_bounce",
    "m@x.com": "manual",
  });
  const { allowed, blocked } = partitionRecipientsBySuppression(
    ["u@x.com", "c@x.com", "b@x.com", "m@x.com"],
    map,
    "transactional",
  );
  assert.deepEqual(allowed.sort(), ["c@x.com", "u@x.com"]);
  assert.deepEqual(blocked.sort(), ["b@x.com", "m@x.com"]);
});

test("matching is case/whitespace-insensitive", () => {
  const map = reasons({ "blocked@x.com": "unsubscribed" });
  const { allowed, blocked } = partitionRecipientsBySuppression(
    ["  Blocked@X.com ", "fine@y.com"],
    map,
    "commercial",
  );
  assert.deepEqual(blocked, ["  Blocked@X.com "]);
  assert.deepEqual(allowed, ["fine@y.com"]);
});

// The "new send path with no class" safety cell: an unclassified send resolves
// to commercial, so even an opt-out (unsubscribed) blocks it.
test("unclassified send is treated as commercial and blocked by an opt-out", () => {
  const map = reasons({ "u@x.com": "unsubscribed" });
  const cls = resolveMessageClass(undefined);
  const { allowed, blocked } = partitionRecipientsBySuppression(
    ["u@x.com"],
    map,
    cls,
  );
  assert.equal(allowed.length, 0);
  assert.deepEqual(blocked, ["u@x.com"]);
});
