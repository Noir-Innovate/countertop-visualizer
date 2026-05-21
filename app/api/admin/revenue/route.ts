import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  startOfCurrentUtcMonth,
  INTERNAL_LINE_MONTHLY_PRICE_CENTS,
  DEFAULT_LEAD_PRICE_CENTS,
} from "@/lib/billing";

export const dynamic = "force-dynamic";

type BillingAccount = {
  organization_id: string;
  internal_plan_status: string;
  internal_plan_cancel_at_period_end: boolean;
};

type PricingRow = {
  organization_id: string;
  lead_price_cents: number;
  effective_at: string;
};

type UsageRow = {
  organization_id: string;
  billed_amount_cents: number;
  excluded_from_billing: boolean;
};

const SUBSCRIBED_STATUSES = new Set(["active", "trialing"]);

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServiceClient();
  const monthStart = startOfCurrentUtcMonth();

  const [orgsRes, billingRes, pricingRes, usageRes] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("organization_billing_accounts")
      .select(
        "organization_id, internal_plan_status, internal_plan_cancel_at_period_end",
      ),
    supabase
      .from("organization_billing_pricing")
      .select("organization_id, lead_price_cents, effective_at")
      .order("effective_at", { ascending: false }),
    supabase
      .from("organization_billing_usage")
      .select("organization_id, billed_amount_cents, excluded_from_billing")
      .gte("occurred_at", monthStart)
      .range(0, 99999),
  ]);

  const firstError =
    orgsRes.error || billingRes.error || pricingRes.error || usageRes.error;
  if (firstError) {
    return NextResponse.json(
      { error: "Failed to fetch revenue", detail: firstError.message },
      { status: 500 },
    );
  }

  const billingByOrg = new Map<string, BillingAccount>();
  for (const row of (billingRes.data ?? []) as BillingAccount[]) {
    billingByOrg.set(row.organization_id, row);
  }

  const priceByOrg = new Map<string, number>();
  for (const row of (pricingRes.data ?? []) as PricingRow[]) {
    if (!priceByOrg.has(row.organization_id)) {
      priceByOrg.set(row.organization_id, row.lead_price_cents);
    }
  }

  const leadCountByOrg = new Map<string, number>();
  const leadCentsByOrg = new Map<string, number>();
  for (const row of (usageRes.data ?? []) as UsageRow[]) {
    if (row.excluded_from_billing) continue;
    leadCountByOrg.set(
      row.organization_id,
      (leadCountByOrg.get(row.organization_id) ?? 0) + 1,
    );
    leadCentsByOrg.set(
      row.organization_id,
      (leadCentsByOrg.get(row.organization_id) ?? 0) + row.billed_amount_cents,
    );
  }

  const subscriptionPriceCents = INTERNAL_LINE_MONTHLY_PRICE_CENTS;

  const customers = (orgsRes.data ?? []).map((org) => {
    const billing = billingByOrg.get(org.id);
    const planStatus = billing?.internal_plan_status ?? null;
    const subscribed = planStatus ? SUBSCRIBED_STATUSES.has(planStatus) : false;
    const pricePerLeadCents =
      priceByOrg.get(org.id) ?? DEFAULT_LEAD_PRICE_CENTS;
    const leadsThisMonth = leadCountByOrg.get(org.id) ?? 0;
    const leadRevenueCents = leadCentsByOrg.get(org.id) ?? 0;
    const subscriptionRevenueCents = subscribed ? subscriptionPriceCents : 0;
    return {
      id: org.id,
      name: org.name,
      plan_status: planStatus,
      plan_cancel_at_period_end:
        billing?.internal_plan_cancel_at_period_end ?? false,
      subscribed,
      price_per_lead_cents: pricePerLeadCents,
      leads_this_month: leadsThisMonth,
      lead_revenue_cents: leadRevenueCents,
      subscription_revenue_cents: subscriptionRevenueCents,
      total_revenue_cents: leadRevenueCents + subscriptionRevenueCents,
    };
  });

  const totals = customers.reduce(
    (acc, c) => {
      acc.lead_revenue_cents += c.lead_revenue_cents;
      acc.subscription_revenue_cents += c.subscription_revenue_cents;
      acc.total_revenue_cents += c.total_revenue_cents;
      acc.leads_this_month += c.leads_this_month;
      acc.subscribed_count += c.subscribed ? 1 : 0;
      return acc;
    },
    {
      lead_revenue_cents: 0,
      subscription_revenue_cents: 0,
      total_revenue_cents: 0,
      leads_this_month: 0,
      subscribed_count: 0,
    },
  );

  return NextResponse.json({
    month_start: monthStart,
    subscription_price_cents: subscriptionPriceCents,
    customers,
    totals,
  });
}
