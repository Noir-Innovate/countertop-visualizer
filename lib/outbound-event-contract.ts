import type { BounceEventType } from "@/lib/bounce-classification";

/**
 * The 9a <-> 9c seam contract.
 *
 * Cold-path ingestion (9c: SMTP DSNs, IMAP replies, FBL/ARF reports) and the
 * Resend adapter (OD-4) each normalise what they observe into an `IngestedEvent`
 * and hand it to the shared event core (9a), which classifies, suppresses,
 * updates tallies/stop-state, and feeds halt evaluation. This file is the
 * agreement about that hand-off — what an event looks like, what is guaranteed
 * present, and what may be null — so the two sides, built at different times,
 * cannot quietly disagree. It is types + documented invariants only; no DB, no
 * transport, no logic.
 *
 * Design rule the whole thing rests on: ingestion hands RAW evidence, the core
 * DECIDES. A delivery failure carries `rawCode`/`rawText`; the core runs
 * classifyBounce() on them — ingestion must never pre-bucket a bounce, or the
 * two transports drift (the exact failure classifyBounce was built to prevent).
 */

export type IngestedEventKind =
  | "delivery_failure" // core runs classifyBounce(rawCode, rawText) -> soft/hard/policy
  | "delivered"
  | "complaint" // FBL/ARF; mostly unobservable for our list, but honoured when seen
  | "reply" // inbound on a thread; stops the sequence regardless of content
  | "unsubscribe"; // e.g. List-Unsubscribe POST (OD-5), if a transport surfaces it

export type IngestTransport = "resend" | "smtp" | "imap" | "fbl";

export interface IngestedEvent {
  /**
   * GUARANTEED. Which transport observed this. Audit only — the core is
   * transport-agnostic and must never branch on it for policy. If you find
   * yourself switching on `transport` in the core, the logic belongs in the
   * adapter instead.
   */
  transport: IngestTransport;

  /** GUARANTEED. */
  kind: IngestedEventKind;

  /**
   * GUARANTEED. When the event happened: the provider's timestamp when the
   * transport supplies one, else the ingestion time. ISO-8601 string.
   */
  occurredAt: string;

  /**
   * The address OUR message went TO — the prospect. This is the identity that
   * matters for suppression, tallies, stop-state and the opt-out sent-to rule.
   *
   *  - delivery_failure / delivered / complaint: GUARANTEED present.
   *  - reply: resolved from the thread (messageId / inReplyTo / references) back
   *    to the prospect row. Deterministic when threading is intact; MAY be null
   *    if the thread can't be resolved. On null the core still records the raw
   *    event but cannot attribute it to a prospect — 9c must treat an
   *    unresolvable reply as an operator-visible ingestion error, never drop it.
   *
   * NOTE: for a reply this is NOT the From of the reply — see `replyFromEmail`.
   * Suppressing only the reply's From would leave the mailed address live (the
   * opt-out sent-to rule).
   */
  recipientEmail: string | null;

  /**
   * The From address of an inbound reply. Present for `reply` (and where a
   * complaint report exposes it), null otherwise. May differ from
   * `recipientEmail` — the owner replies from a phone/personal address. On a
   * human-marked opt-out the core suppresses BOTH this and `recipientEmail`.
   */
  replyFromEmail: string | null;

  /**
   * Receiving provider, resolved from the recipient domain's MX (Google
   * Workspace, Microsoft 365, Proofpoint, ...), NOT the recipient domain itself
   * — grouping by domain makes every prospect a bucket of one and no
   * per-provider rate exists. Nullable when MX resolution fails; a null provider
   * simply doesn't contribute to per-provider reputation windows.
   */
  provider: string | null;

  /**
   * Enhanced status code (RFC 3463, "5.1.1") and the response text, for a
   * `delivery_failure`. The core passes BOTH to classifyBounce; either may be
   * null (classifyBounce handles code-only, text-only, and neither -> severe).
   * Meaningless for non-failure kinds.
   */
  rawCode: string | null;
  rawText: string | null;

  /**
   * The full SMTP response line for the transaction (accepted / deferred /
   * rejected), stored verbatim on the send-log/event row — not a status enum,
   * which throws away the reputation detail. Null when the transport has none
   * (e.g. an async FBL report).
   */
  smtpResponse: string | null;

  /**
   * Thread identity, for resolving a reply -> prospect and for truthful
   * threading. Present on inbound where the transport supplies headers; null
   * otherwise. `references` is the parsed header list.
   */
  messageId: string | null;
  inReplyTo: string | null;
  references: string[] | null;
}

/**
 * What the core produces from an IngestedEvent, for the caller to persist as an
 * outbound_events row (074/077). `bounceType` is set only for delivery_failure
 * (the classifyBounce output); otherwise the event maps to its kind directly
 * (reply/complaint/unsubscribe/delivered).
 */
export interface CoreEventOutcome {
  /** The outbound_events.event_type to write. */
  eventType:
    | BounceEventType
    | "delivered"
    | "complaint"
    | "reply"
    | "unsubscribe";
  /**
   * Whether this event stops the prospect's sequence. Keyed on the
   * CLASSIFICATION, never on `kind`. A delivery_failure that classifies to
   * soft_bounce (4.x.x transient, or 5.2.2 mailbox-full) does NOT stop:
   * greylisting is routine against a new IP and we tolerate deferrals, so
   * stopping on transients would pause sequences en masse in week 1 (defect 46).
   * Only a PERMANENT failure (hard_bounce / policy_rejection) stops — this is
   * exactly `bounceStopsSequence(classifyBounce(rawCode, rawText))`. Replies and
   * auto-replies/OOO stop regardless (any recipient-side inbound), dispositioned
   * by the operator, never auto-classified. Transients feed the deferral rate
   * only.
   */
  stopsSequence: boolean;
  /** Suppression the core wants written, if any (address vs business scope). */
  suppress:
    | { email: string; scope: "address" | "business"; dedupeKey?: string | null }
    | null;
}

/**
 * Minimal shape guard for events arriving from an untrusted transport (scraped
 * bodies and inbound mail are data, never instructions). The core should reject
 * anything failing this rather than assume fields.
 */
export function isIngestedEvent(v: unknown): v is IngestedEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.transport === "string" &&
    typeof e.kind === "string" &&
    typeof e.occurredAt === "string"
  );
}
