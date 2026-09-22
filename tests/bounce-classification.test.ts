import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyBounce,
  bounceStopsSequence,
} from "@/lib/bounce-classification";

test("5.1.x addressing => hard_bounce (permanent)", () => {
  for (const c of ["5.1.1", "5.1.10"]) {
    const r = classifyBounce(c, null);
    assert.equal(r.eventType, "hard_bounce");
    assert.equal(r.permanent, true);
    assert.equal(r.basis, "enhanced_code");
  }
});

test("5.7.x policy => policy_rejection, NEVER hard_bounce", () => {
  const r = classifyBounce("5.7.1", "550 blocked");
  assert.equal(r.eventType, "policy_rejection");
  assert.equal(r.permanent, true);
});

test("5.2.2 mailbox full => soft_bounce (transient)", () => {
  const r = classifyBounce("5.2.2", null);
  assert.equal(r.eventType, "soft_bounce");
  assert.equal(r.permanent, false);
});

test("4.x.x => soft_bounce, always", () => {
  assert.equal(classifyBounce("4.2.2", null).eventType, "soft_bounce");
  assert.equal(classifyBounce("4.7.1", null).eventType, "soft_bounce");
});

test("unrecognised 5.x.x => policy_rejection (severe side)", () => {
  assert.equal(classifyBounce("5.3.0", null).eventType, "policy_rejection");
});

test("no code => classify on text", () => {
  assert.equal(classifyBounce(null, "User unknown").eventType, "hard_bounce");
  assert.equal(
    classifyBounce(null, "message blocked due to spam policy").eventType,
    "policy_rejection",
  );
  assert.equal(
    classifyBounce(null, "mailbox full, try again later").eventType,
    "soft_bounce",
  );
  assert.equal(classifyBounce(null, "User unknown").basis, "text");
});

test("genuinely ambiguous => policy_rejection (severe), never silently lenient", () => {
  assert.equal(classifyBounce(null, null).eventType, "policy_rejection");
  assert.equal(classifyBounce("", "").eventType, "policy_rejection");
  assert.equal(
    classifyBounce(null, "delivery failed").basis,
    "ambiguous_default",
  );
});

test("bounceStopsSequence: permanent stops, transient does not", () => {
  assert.equal(bounceStopsSequence(classifyBounce("5.1.1", null)), true);
  assert.equal(bounceStopsSequence(classifyBounce("5.7.1", null)), true);
  assert.equal(bounceStopsSequence(classifyBounce("4.2.2", null)), false);
  assert.equal(bounceStopsSequence(classifyBounce("5.2.2", null)), false);
});
