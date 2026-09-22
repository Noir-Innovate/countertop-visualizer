import { createServiceClient } from "@/lib/supabase/server";

export type SuppressionReason =
  | "unsubscribed"
  | "hard_bounce"
  | "manual"
  | "complaint";

/**
 * The kind of email being sent. Determines which suppression reasons block it.
 *  - commercial:    outbound campaign / marketing mail.
 *  - transactional: relationship mail the recipient needs (password reset,
 *                   login/verification, an invite they asked for, billing /
 *                   receipt, a paying tenant's own lead notification).
 */
export type MessageClass = "commercial" | "transactional";

/**
 * Fail-closed resolution: anything not EXPLICITLY transactional is treated as
 * commercial. A new send path that forgets to declare its class is therefore
 * held to the stricter policy, never the looser one.
 */
export function resolveMessageClass(
  cls: MessageClass | null | undefined,
): MessageClass {
  return cls === "transactional" ? "transactional" : "commercial";
}

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
 * The suppression policy matrix (Packet OD-2 decision). Whether a suppressed
 * address blocks a given message depends on WHY it was suppressed and WHAT kind
 * of mail we're sending:
 *
 *   reason \ class    commercial    transactional
 *   unsubscribed      BLOCK         allow
 *   complaint         BLOCK         allow
 *   hard_bounce       BLOCK         BLOCK
 *   manual            BLOCK         BLOCK
 *
 * Opting out of our cold campaign (unsubscribed / complaint) must NOT stop a
 * password reset or other relationship mail — CAN-SPAM opt-out is about
 * commercial messages. A dead address (hard_bounce) or an explicit never-contact
 * (manual) blocks everything, transactional included. Unknown reason → fail
 * closed (block).
 */
export function isBlockedByReason(
  reason: SuppressionReason,
  messageClass: MessageClass,
): boolean {
  switch (reason) {
    case "hard_bounce":
    case "manual":
      return true;
    case "unsubscribed":
    case "complaint":
      return messageClass === "commercial";
    default:
      return true;
  }
}

/**
 * Pure partition of a recipient list into allowed vs blocked, given a map of
 * normalised suppressed address -> reason and the message class. Extracted so
 * the whole policy matrix is unit testable without a database.
 */
export function partitionRecipientsBySuppression(
  recipients: string[],
  suppressedReasons: Map<string, SuppressionReason>,
  messageClass: MessageClass,
): { allowed: string[]; blocked: string[] } {
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const r of recipients) {
    const reason = suppressedReasons.get(normalizeEmail(r));
    if (reason && isBlockedByReason(reason, messageClass)) {
      blocked.push(r);
    } else {
      allowed.push(r);
    }
  }
  return { allowed, blocked };
}

/**
 * THE shared suppression check. Every send path funnels through `sendEmail`
 * in lib/resend.ts, which calls this before handing anything to Resend.
 * Do not add a second copy of this logic anywhere — the bypass test
 * (tests/no-unguarded-send-paths.test.ts) enforces the single choke point.
 *
 * Queries the global suppression list (service role; the table has no client
 * policies) and applies the reason x class matrix. Matching is on the
 * normalised email form.
 */
export async function filterSuppressedRecipients(
  recipients: string[],
  messageClass: MessageClass,
): Promise<{ allowed: string[]; blocked: string[] }> {
  const cls = resolveMessageClass(messageClass);
  const unique = Array.from(
    new Set(recipients.map((r) => normalizeEmail(r)).filter((r) => r !== "")),
  );
  if (unique.length === 0) {
    return { allowed: [], blocked: [] };
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("suppression")
    .select("email, reason")
    .in("email", unique);

  if (error) {
    // Fail CLOSED. A suppression lookup that errors must never be treated as
    // "not suppressed" — for autonomous sending that would be the exact gap the
    // safety net exists to prevent. Refuse every recipient and let the caller
    // surface the failure.
    throw new Error(`suppression check failed: ${error.message}`);
  }

  const reasons = new Map<string, SuppressionReason>();
  for (const row of data ?? []) {
    reasons.set(
      normalizeEmail(row.email as string),
      row.reason as SuppressionReason,
    );
  }
  return partitionRecipientsBySuppression(recipients, reasons, cls);
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
