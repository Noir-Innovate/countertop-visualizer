import test from "node:test";
import assert from "node:assert/strict";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-unsubscribe-tokens";

// Import after the secret is set so module init picks it up lazily (secret() is
// read at call time, so order is not strictly required, but keep it explicit).
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/unsubscribe-token";

test("token round-trips to the normalised email", () => {
  const token = createUnsubscribeToken("Prospect@Example.COM");
  assert.equal(verifyUnsubscribeToken(token), "prospect@example.com");
});

test("case/whitespace differences produce the same identity", () => {
  const a = verifyUnsubscribeToken(createUnsubscribeToken("  A@B.com "));
  const b = verifyUnsubscribeToken(createUnsubscribeToken("a@b.com"));
  assert.equal(a, "a@b.com");
  assert.equal(b, "a@b.com");
});

test("tampered signature is rejected", () => {
  const token = createUnsubscribeToken("x@y.com");
  const [payload] = token.split(".");
  assert.equal(verifyUnsubscribeToken(`${payload}.deadbeef`), null);
});

test("tampered payload (different email) is rejected", () => {
  const token = createUnsubscribeToken("real@y.com");
  const [, sig] = token.split(".");
  const forgedPayload = Buffer.from("attacker@y.com", "utf8").toString(
    "base64url",
  );
  assert.equal(verifyUnsubscribeToken(`${forgedPayload}.${sig}`), null);
});

test("malformed tokens return null, not throw", () => {
  assert.equal(verifyUnsubscribeToken(""), null);
  assert.equal(verifyUnsubscribeToken(null), null);
  assert.equal(verifyUnsubscribeToken("nodot"), null);
});
