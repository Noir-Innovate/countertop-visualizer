import { createServiceClient } from "@/lib/supabase/server";

export type SuppressionReason =
  | "unsubscribed"
  | "hard_bounce"
  | "manual"
  | "complaint";

/**
 * Normalise an email for storage and comparison: trim + lowercase.
 *
 * This is the ONE definition of "the same address" used across prospects,
 * suppression, and the send guard. The DB unique indexes are on lower(email)
 * to match (see migration 074), so a case/whitespace difference can never
 * create a duplicate prospect or a suppression the guard misses.
 */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Pure partition of a recipient list into allowed vs suppressed, given the set
 * of normalised suppressed addresses. Extracted so the matching logic is unit
 * testable without a database. Comparison is on the normalised form.
 */
export function partitionRecipientsBySuppression(
  recipients: string[],
  suppressedNormalized: Set<string>,
): { allowed: string[]; suppressed: string[] } {
  const allowed: string[] = [];
  const suppressed: string[] = [];
  for (const r of recipients) {
    if (suppressedNormalized.has(normalizeEmail(r))) {
      suppressed.push(r);
    } else {
      allowed.push(r);
    }
  }
  return { allowed, suppressed };
}

/**
 * THE shared suppression check. Every send path funnels through `sendEmail`
 * in lib/resend.ts, which calls this before handing anything to Resend.
 * Do not add a second copy of this logic anywhere — the bypass test
 * (tests/no-unguarded-send-paths.test.ts) enforces the single choke point.
 *
 * Queries the global suppression list (service role; the table has no client
 * policies) and returns which of the given recipients are suppressed and which
 * may be sent to. Matching is on the normalised email form.
 */
export async function filterSuppressedRecipients(
  recipients: string[],
): Promise<{ allowed: string[]; suppressed: string[] }> {
  const unique = Array.from(
    new Set(recipients.map((r) => normalizeEmail(r)).filter((r) => r !== "")),
  );
  if (unique.length === 0) {
    return { allowed: [], suppressed: [] };
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("suppression")
    .select("email")
    .in("email", unique);

  if (error) {
    // Fail CLOSED. A suppression lookup that errors must never be treated as
    // "not suppressed" — for autonomous sending that would be the exact gap the
    // safety net exists to prevent. Refuse every recipient and let the caller
    // surface the failure.
    throw new Error(`suppression check failed: ${error.message}`);
  }

  const suppressedSet = new Set(
    (data ?? []).map((row) => normalizeEmail(row.email as string)),
  );
  return partitionRecipientsBySuppression(recipients, suppressedSet);
}

/**
 * Idempotently add an address to the global suppression list. The single write
 * path shared by unsubscribe (OD-5), bounce/complaint handling (OD-4), and
 * manual admin adds (OD-6). Re-adding an already-suppressed address is a no-op
 * success (the earliest reason is kept). The DB trigger normalises the stored
 * email; we normalise here too so the caller's value is consistent.
 */
export async function addSuppression(
  email: string,
  reason: SuppressionReason,
): Promise<{ ok: boolean; alreadySuppressed: boolean; error?: string }> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, alreadySuppressed: false, error: "empty email" };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("suppression")
    .insert({ email: normalized, reason });

  if (error) {
    // 23505 = unique violation → already on the list. That is success for an
    // idempotent operation, not an error.
    if (error.code === "23505") {
      return { ok: true, alreadySuppressed: true };
    }
    return { ok: false, alreadySuppressed: false, error: error.message };
  }
  return { ok: true, alreadySuppressed: false };
}
