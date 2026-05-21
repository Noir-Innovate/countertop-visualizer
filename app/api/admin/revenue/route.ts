import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/stripe";
import {
  startOfCurrentUtcMonth,
  DEFAULT_LEAD_PRICE_CENTS,
  subscriptionMonthlyCentsAfterDiscount,
} from "@/lib/billing";

export const dynamic = "force-dynamic";

type BillingAccount = {
  organization_id: string;
  internal_plan_status: string;
  internal_plan_cancel_at_period_end: boolean;
  internal_plan_subscription_id: string | null;
  stripe_customer_id: string | null;
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

type SubscriptionRow = {
  organization_id: string;
  stripe_subscription_id: string;
  status: string;
  monthly_recurring_cents: number | null;
  updated_at: string;
};

const SUBSCRIBED_STATUSES = new Set(["active", "trialing"]);

async function backfillMonthlyCents(
  supabase: any,
  organizationId: string,
  subscriptionId: string | null,
  customerId: string | null,
): Promise<{ monthlyCents: number; status: string | null }> {
  if (!subscriptionId && !customerId) {
    return { monthlyCents: 0, status: null };
  }
  try {
    const stripe = getStripeServerClient();
    let subscription: any = null;
    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } else if (customerId) {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
      });
      subscription = list.data[0] ?? null;
    }
    if (!subscription) return { monthlyCents: 0, status: null };

    const monthlyCents = await subscriptionMonthlyCentsAfterDiscount(
      stripe,
      subscription,
    );
    const status: string = subscription.status;

    // Persist so subsequent requests stay snappy.
    await supabase
      .from("organization_billing_subscriptions")
      .upsert(
        {
          organization_id: organizationId,
          stripe_subscription_id: subscription.id,
          status,
          current_period_start: subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000).toISOString()
            : null,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          monthly_recurring_cents: monthlyCents,
        },
        { onConflict: "stripe_subscription_id" },
      )
      .then(
        () => {},
        (err: unknown) =>
          console.error("[admin/revenue] backfill upsert failed:", err),
      );

    return { monthlyCents, status };
  } catch (err) {
    console.error(
      `[admin/revenue] Stripe backfill failed for org=${organizationId} sub=${subscriptionId}:`,
      err,
    );
    return { monthlyCents: 0, status: null };
  }
}

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServiceClient();
  const monthStart = startOfCurrentUtcMonth();

  const [orgsRes, billingRes, pricingRes, usageRes, subsRes] =
    await Promise.all([
      supabase.from("organizations").select("id, name").order("name"),
      supabase
        .from("organization_billing_accounts")
        .select(
          "organization_id, internal_plan_status, internal_plan_cancel_at_period_end, internal_plan_subscription_id, stripe_customer_id",
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
      supabase
        .from("organization_billing_subscriptions")
        .select(
          "organization_id, stripe_subscription_id, status, monthly_recurring_cents, updated_at",
        )
        .order("updated_at", { ascending: false }),
    ]);

  const firstError =
    orgsRes.error ||
    billingRes.error ||
    pricingRes.error ||
    usageRes.error ||
    subsRes.error;
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

  // Build a per-org map of the most recently-updated stored subscription row.
  const storedSubByOrg = new Map<string, SubscriptionRow>();
  for (const row of (subsRes.data ?? []) as SubscriptionRow[]) {
    if (!storedSubByOrg.has(row.organization_id)) {
      storedSubByOrg.set(row.organization_id, row);
    }
  }

  const orgs = orgsRes.data ?? [];

  // Resolve each org's monthly subscription amount:
  //  1. Prefer the stored value in organization_billing_subscriptions.
  //  2. If missing (or value is null) AND the account points at a Stripe
  //     subscription, query Stripe once and persist the result so future
  //     requests stay fast.
  //  3. Otherwise treat as $0 — covers comped/demo accounts whose internal
  //     status is "active" but never had a real Stripe subscription.
  const monthlyCentsByOrg = new Map<string, number>();
  await Promise.all(
    orgs.map(async (org) => {
      const billing = billingByOrg.get(org.id);
      if (!billing) return;
      if (!SUBSCRIBED_STATUSES.has(billing.internal_plan_status)) return;

      const stored = storedSubByOrg.get(org.id);
      if (stored && stored.monthly_recurring_cents != null) {
        if (SUBSCRIBED_STATUSES.has(stored.status)) {
          monthlyCentsByOrg.set(org.id, stored.monthly_recurring_cents);
        }
        return;
      }

      const { monthlyCents, status } = await backfillMonthlyCents(
        supabase,
        org.id,
        billing.internal_plan_subscription_id,
        billing.stripe_customer_id,
      );
      if (
        monthlyCents > 0 &&
        status &&
        SUBSCRIBED_STATUSES.has(status)
      ) {
        monthlyCentsByOrg.set(org.id, monthlyCents);
      }
    }),
  );

  const customers = orgs.map((org) => {
    const billing = billingByOrg.get(org.id);
    const planStatus = billing?.internal_plan_status ?? null;
    const subscriptionRevenueCents = monthlyCentsByOrg.get(org.id) ?? 0;
    // Count as "subscribed" only if there's a real, paying Stripe sub backing
    // this org — excludes comped/demo orgs whose local status is active.
    const subscribed = subscriptionRevenueCents > 0;
    const pricePerLeadCents =
      priceByOrg.get(org.id) ?? DEFAULT_LEAD_PRICE_CENTS;
    const leadsThisMonth = leadCountByOrg.get(org.id) ?? 0;
    const leadRevenueCents = leadCentsByOrg.get(org.id) ?? 0;
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
    customers,
    totals,
  });
}
