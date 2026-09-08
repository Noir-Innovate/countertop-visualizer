import crypto from "node:crypto";
import { normalizeEmail } from "@/lib/email-suppression";

/**
 * Stateless, tamper-proof unsubscribe tokens for the List-Unsubscribe header
 * (OD-5). A token is `base64url(email).hmac` — no DB row needed to issue one,
 * and it cannot be forged without the server secret, so the one-click endpoint
 * needs no auth session.
 *
 * Secret: a dedicated UNSUBSCRIBE_SECRET if set, else the service role key
 * (server-only, high entropy) so this works without new configuration.
 */
function secret(): string {
  const s =
    process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "UNSUBSCRIBE_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to sign unsubscribe tokens",
    );
  }
  return s;
}

function sign(normalizedEmail: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(normalizedEmail)
    .digest("base64url");
}

export function createUnsubscribeToken(email: string): string {
  const normalized = normalizeEmail(email);
  const payload = Buffer.from(normalized, "utf8").toString("base64url");
  return `${payload}.${sign(normalized)}`;
}

/**
 * Returns the normalised email if the token is authentic, else null.
 * Constant-time signature comparison.
 */
export function verifyUnsubscribeToken(token: string | null): string | null {
  const [payload, sig] = (token ?? "").split(".");
  if (!payload || !sig) return null;

  let email: string;
  try {
    email = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const expected = sign(normalized);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return normalized;
}
