import type { UsageRow } from "@/lib/lead-billing-service";

/**
 * Matches `get_unique_lead_count` / SQL:
 * COALESCE(NULLIF(TRIM(phone), ''), NULLIF(TRIM(email), ''), lead_id::text)
 */
export function getLeadBillingIdentityKey(
  phone: string | null | undefined,
  email: string | null | undefined,
  leadId: string,
): string {
  const trimmedPhone = (phone ?? "").trim();
  if (trimmedPhone !== "") return trimmedPhone;
  const trimmedEmail = (email ?? "").trim();
  if (trimmedEmail !== "") return trimmedEmail;
  return leadId;
}

export type LeadContact = { email: string | null; phone: string | null };

export type BillingUsageRowWithLead = {
  id: string;
  lead_id: string;
  billed_amount_cents: number | null;
  occurred_at: string;
  /** PostgREST may return one object or a single-element array for the FK embed. */
  leads: LeadContact | LeadContact[] | null;
};

function embedLeadContact(
  leads: BillingUsageRowWithLead["leads"],
): LeadContact | null {
  if (leads == null) return null;
  return Array.isArray(leads) ? leads[0] ?? null : leads;
}

/**
 * One billable line per distinct identity (phone, else email, else lead id).
 * When multiple usage rows share an identity, keeps the earliest `occurred_at`
 * row and its `billed_amount_cents`.
 */
export function dedupeBillingUsageRowsForInvoice(
  rows: BillingUsageRowWithLead[],
): UsageRow[] {
  const bestByKey = new Map<
    string,
    { occurredAtMs: number; row: UsageRow }
  >();

  for (const raw of rows) {
    const lead = embedLeadContact(raw.leads);
    const key = getLeadBillingIdentityKey(
      lead?.phone,
      lead?.email,
      raw.lead_id,
    );
    const occurredAtMs = new Date(raw.occurred_at).getTime();
    const billedAmountCents = raw.billed_amount_cents ?? 0;
    const candidate: UsageRow = {
      id: raw.id,
      billedAmountCents: billedAmountCents,
    };
    const existing = bestByKey.get(key);
    if (!existing || occurredAtMs < existing.occurredAtMs) {
      bestByKey.set(key, { occurredAtMs, row: candidate });
    }
  }

  return Array.from(bestByKey.values()).map((e) => e.row);
}
