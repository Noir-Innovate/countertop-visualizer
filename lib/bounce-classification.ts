/**
 * Enhanced-status-code bounce classifier (Packet OD, Mara defect on 5xx bucketing).
 *
 * TRANSPORT-AGNOSTIC and pure: the Resend webhook (OD-4) and the SMTP/IMAP cold
 * path (OD-9) both classify through this one function, so the two paths can
 * never drift. Classification is by the RFC 3463 enhanced status code, never by
 * bucketing everything 5xx as a bounce — that would silently turn a 5.7.x policy
 * rejection (our most severe trigger, a HALT at n=1) into a hard bounce (one of
 * our most lenient).
 *
 *   5.1.x  addressing / no such user      -> hard_bounce      (permanent)
 *   5.7.x  policy / reputation / blocked   -> policy_rejection (permanent, HALT)
 *   5.2.2  mailbox full                    -> soft_bounce      (transient)
 *   4.x.x  transient                       -> soft_bounce      (transient)
 *   other 5.x.x                            -> policy_rejection (ambiguous->severe)
 *   no code present                        -> classify on the response text
 *   genuinely ambiguous                    -> policy_rejection (severe side)
 *
 * Ambiguous resolves to the severe side on purpose: a false halt costs ~two
 * days; a silent severity downgrade costs the domain. Callers store the raw code
 * and text on the event row so the classification is always re-derivable.
 */

export type BounceEventType = "hard_bounce" | "soft_bounce" | "policy_rejection";

export interface BounceClassification {
  eventType: BounceEventType;
  /** false only for soft_bounce (transient/retriable); hard + policy are permanent. */
  permanent: boolean;
  /** how the call was decided, for audit. */
  basis: "enhanced_code" | "text" | "ambiguous_default";
}

function mk(
  eventType: BounceEventType,
  basis: BounceClassification["basis"],
): BounceClassification {
  return { eventType, permanent: eventType !== "soft_bounce", basis };
}

export function classifyBounce(
  enhancedCode: string | null | undefined,
  responseText: string | null | undefined,
): BounceClassification {
  const code = (enhancedCode ?? "").trim();
  const m = code.match(/^([245])\.(\d+)\.(\d+)$/);
  if (m) {
    const cls = m[1];
    if (cls === "4") return mk("soft_bounce", "enhanced_code");
    if (cls === "5") {
      if (code === "5.2.2") return mk("soft_bounce", "enhanced_code"); // mailbox full
      if (code.startsWith("5.1.")) return mk("hard_bounce", "enhanced_code");
      if (code.startsWith("5.7.")) return mk("policy_rejection", "enhanced_code");
      // Unrecognised permanent code -> severe side, never a lenient hard bounce.
      return mk("policy_rejection", "enhanced_code");
    }
    // 2.x.x success shouldn't reach a bounce classifier; treat as non-permanent.
    return mk("soft_bounce", "enhanced_code");
  }

  // No usable enhanced code: fall back to the response text.
  const t = (responseText ?? "").toLowerCase();
  if (t) {
    if (
      /(user unknown|no such user|does not exist|unknown recipient|recipient not found|invalid recipient|no mailbox|address unknown|mailbox not found)/.test(
        t,
      )
    ) {
      return mk("hard_bounce", "text");
    }
    if (
      /(policy|spam|black ?list|block ?list|blocked|reputation|denied|not allowed|prohibited|access denied)/.test(
        t,
      )
    ) {
      return mk("policy_rejection", "text");
    }
    if (
      /(mailbox full|over ?quota|quota exceeded|insufficient storage|try again|temporar|deferred|grey ?list|rate ?limit|throttl|too many|timeout|timed out)/.test(
        t,
      )
    ) {
      return mk("soft_bounce", "text");
    }
  }

  // Nothing conclusive -> severe side.
  return mk("policy_rejection", "ambiguous_default");
}

/**
 * OD-9 STOP trigger (defect 46): a recipient-side PERMANENT failure stops the
 * sequence; a transient (4.x.x / soft) one only feeds the deferral rate and
 * never stops. Complaints and replies stop too, but they arrive as their own
 * event types, not through here.
 */
export function bounceStopsSequence(c: BounceClassification): boolean {
  return c.permanent;
}
