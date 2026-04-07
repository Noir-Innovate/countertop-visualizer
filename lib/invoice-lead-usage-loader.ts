import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageRow } from "@/lib/lead-billing-service";
import {
  dedupeBillingUsageRowsForInvoice,
  type BillingUsageRowWithLead,
} from "@/lib/lead-billing-identity";

/**
 * Uninvoiced usage for a billing window, joined to lead contact fields and
 * deduplicated by email/phone (same rules as `get_unique_lead_count`).
 *
 * Used by `/api/billing/invoice-lead-usage` for both cron (GET→POST) and manual runs.
 */
export async function fetchDedupedUninvoicedUsageForInvoicePeriod(
  supabase: SupabaseClient,
  organizationId: string,
  periodStartIso: string,
  periodEndIso: string,
): Promise<UsageRow[]> {
  const { data, error } = await supabase
    .from("organization_billing_usage")
    .select(
      "id, lead_id, billed_amount_cents, occurred_at, leads(email, phone)",
    )
    .eq("organization_id", organizationId)
    .is("invoiced_at", null)
    .eq("excluded_from_billing", false)
    .gte("occurred_at", periodStartIso)
    .lt("occurred_at", periodEndIso);

  if (error) throw new Error(error.message);

  const rows = (data || []) as unknown as BillingUsageRowWithLead[];
  return dedupeBillingUsageRowsForInvoice(rows);
}
