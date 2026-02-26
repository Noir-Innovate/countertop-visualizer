import { DEFAULT_LEAD_PRICE_CENTS } from "@/lib/billing";

type SupabaseLike = {
  from: (table: string) => any;
};

export async function getEffectiveLeadPriceCents(
  supabase: SupabaseLike,
  organizationId: string,
  occurredAtIso: string,
) {
  const { data: leadPricing } = await supabase
    .from("organization_billing_pricing")
    .select("lead_price_cents")
    .eq("organization_id", organizationId)
    .lte("effective_at", occurredAtIso)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return leadPricing?.lead_price_cents ?? DEFAULT_LEAD_PRICE_CENTS;
}

export async function trackLeadBillingUsage({
  supabase,
  leadId,
  organizationId,
  materialLineId,
  occurredAtIso,
}: {
  supabase: SupabaseLike;
  leadId: string;
  organizationId: string;
  materialLineId?: string | null;
  occurredAtIso: string;
}) {
  const leadPriceCents = await getEffectiveLeadPriceCents(
    supabase,
    organizationId,
    occurredAtIso,
  );

  const { error: usageInsertError } = await supabase
    .from("organization_billing_usage")
    .insert({
      organization_id: organizationId,
      lead_id: leadId,
      material_line_id: materialLineId ?? null,
      lead_price_cents: leadPriceCents,
      billed_amount_cents: leadPriceCents,
      occurred_at: occurredAtIso,
    });

  // Unique(lead_id) makes writes idempotent. Duplicate writes should be a no-op.
  if (usageInsertError?.code === "23505") {
    return { tracked: true, duplicate: true };
  }

  if (usageInsertError) {
    return { tracked: false, error: usageInsertError };
  }

  return { tracked: true, duplicate: false };
}
