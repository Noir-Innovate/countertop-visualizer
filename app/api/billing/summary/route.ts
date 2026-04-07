import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/stripe";
import {
  startOfCurrentUtcMonth,
  INTERNAL_LINE_MONTHLY_PRICE_CENTS,
  DEFAULT_LEAD_PRICE_CENTS,
} from "@/lib/billing";
import { getCurrentMonthPeriod } from "@/lib/lead-invoicing";
import {
  dedupeBillingUsageRowsForInvoice,
  type BillingUsageRowWithLead,
} from "@/lib/lead-billing-identity";

function normalizeInternalPlanStatus(status: string | null | undefined) {
  if (!status) return "inactive";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  if (status === "canceled" || status === "unpaid") return "canceled";
  if (status === "active") return "active";
  return "inactive";
}

function shouldShowNextBillingDate(status: string, cancelAtPeriodEnd: boolean) {
  return (
    !cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(status)
  );
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: membership }, { data: profile }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("organization_id", organizationId)
        .single(),
      supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", user.id)
        .single(),
    ]);

    const isSuperAdmin = Boolean(profile?.is_super_admin);
    if (!membership && !isSuperAdmin) {
      return NextResponse.json(
        { error: "You do not have access to this organization" },
        { status: 403 },
      );
    }

    const membershipRole =
      membership?.role ?? (isSuperAdmin ? "super_admin" : "");

    // Super admins use service client to bypass RLS when viewing orgs they're not members of
    const db = isSuperAdmin ? await createServiceClient() : supabase;

    const nowIso = new Date().toISOString();
    const monthStartIso = startOfCurrentUtcMonth();

    const [
      orgResponse,
      billingAccountResponse,
      latestPricingResponse,
      monthUsageResponse,
      internalLineCountResponse,
      latestSubscriptionResponse,
    ] = await Promise.all([
      db.from("organizations").select("name").eq("id", organizationId).single(),
      db
        .from("organization_billing_accounts")
        .select(
          "internal_plan_status, internal_plan_current_period_end, internal_plan_cancel_at_period_end, stripe_customer_id, internal_plan_subscription_id",
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
      db
        .from("organization_billing_pricing")
        .select("lead_price_cents, effective_at")
        .eq("organization_id", organizationId)
        .lte("effective_at", nowIso)
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("organization_billing_usage")
        .select(
          "id, lead_id, billed_amount_cents, occurred_at, leads(email, phone)",
        )
        .eq("organization_id", organizationId)
        .eq("excluded_from_billing", false)
        .is("invoiced_at", null)
        .gte("occurred_at", monthStartIso),
      db
        .from("material_lines")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("line_kind", "internal"),
      db
        .from("organization_billing_subscriptions")
        .select("status, current_period_end, cancel_at_period_end")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const orgName = orgResponse.data?.name ?? "Organization";
    if (billingAccountResponse.error) throw billingAccountResponse.error;
    if (latestPricingResponse.error) throw latestPricingResponse.error;
    if (monthUsageResponse.error) throw monthUsageResponse.error;
    if (internalLineCountResponse.error) throw internalLineCountResponse.error;
    if (latestSubscriptionResponse.error)
      throw latestSubscriptionResponse.error;

    const monthUsageRows = (monthUsageResponse.data ||
      []) as unknown as BillingUsageRowWithLead[];
    const dedupedMonthUsage = dedupeBillingUsageRowsForInvoice(monthUsageRows);
    const monthLeadCount = dedupedMonthUsage.length;
    const monthLeadTotalCents = dedupedMonthUsage.reduce(
      (sum, row) => sum + (row.billedAmountCents || 0),
      0,
    );
    const { endIso: leadPeriodEndIso } = getCurrentMonthPeriod(new Date());

    let status =
      billingAccountResponse.data?.internal_plan_status ||
      latestSubscriptionResponse.data?.status ||
      "inactive";
    let currentPeriodEnd =
      billingAccountResponse.data?.internal_plan_current_period_end ||
      latestSubscriptionResponse.data?.current_period_end ||
      null;
    let cancelAtPeriodEnd =
      billingAccountResponse.data?.internal_plan_cancel_at_period_end ||
      latestSubscriptionResponse.data?.cancel_at_period_end ||
      false;

    // If local rows are stale/missing period data, fetch latest directly from Stripe.
    if (
      (!currentPeriodEnd || !status || status === "inactive") &&
      billingAccountResponse.data?.stripe_customer_id
    ) {
      try {
        const stripe = getStripeServerClient();
        const subscriptionId =
          billingAccountResponse.data.internal_plan_subscription_id;

        const subscriptionResponse = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId)
          : (
              await stripe.subscriptions.list({
                customer: billingAccountResponse.data.stripe_customer_id,
                status: "all",
                limit: 1,
              })
            ).data[0];

        const subscription: any =
          subscriptionResponse &&
          typeof subscriptionResponse === "object" &&
          "data" in subscriptionResponse
            ? (subscriptionResponse as any).data
            : subscriptionResponse;

        if (subscription) {
          status = normalizeInternalPlanStatus(subscription.status);
          currentPeriodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : currentPeriodEnd;
          cancelAtPeriodEnd = subscription.cancel_at_period_end;
        }
      } catch (stripeError) {
        console.error("Billing summary Stripe fallback failed:", stripeError);
      }
    }

    const nextBillingAt = shouldShowNextBillingDate(status, cancelAtPeriodEnd)
      ? currentPeriodEnd
      : null;
    const planEndsAt = cancelAtPeriodEnd ? currentPeriodEnd : null;

    return NextResponse.json({
      organizationName: orgName,
      membershipRole,
      isSuperAdmin: Boolean(profile?.is_super_admin),
      leadPricing: {
        leadPriceCents:
          latestPricingResponse.data?.lead_price_cents ??
          DEFAULT_LEAD_PRICE_CENTS,
        effectiveAt: latestPricingResponse.data?.effective_at ?? null,
      },
      internalPlan: {
        monthlyPriceCents: INTERNAL_LINE_MONTHLY_PRICE_CENTS,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        nextBillingAt,
        planEndsAt,
        internalLineCount: internalLineCountResponse.count || 0,
        hasCustomer: Boolean(billingAccountResponse.data?.stripe_customer_id),
      },
      usageMonthToDate: {
        leadCount: monthLeadCount,
        totalAmountCents: monthLeadTotalCents,
      },
      leadBilling: {
        periodStartIso: monthStartIso,
        periodEndIso: leadPeriodEndIso,
        nextInvoiceRunAt: leadPeriodEndIso,
      },
    });
  } catch (error) {
    console.error("Billing summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing summary" },
      { status: 500 },
    );
  }
}
