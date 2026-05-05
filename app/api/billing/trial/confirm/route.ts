import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getStripeServerClient } from "@/lib/stripe";

interface Body {
  organizationId: string;
  setupIntentId: string;
  promotionCodeId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { organizationId, setupIntentId, promotionCodeId } =
      (await request.json()) as Body;
    if (!organizationId || !setupIntentId) {
      return NextResponse.json(
        { error: "organizationId and setupIntentId are required" },
        { status: 400 },
      );
    }

    const supabase = await createAuthedClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You do not have permission to manage billing" },
        { status: 403 },
      );
    }

    const stripe = getStripeServerClient();
    const service = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: billing } = await service
      .from("organization_billing_accounts")
      .select("stripe_customer_id, internal_plan_status")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (
      billing?.internal_plan_status &&
      ["active", "trialing", "past_due"].includes(billing.internal_plan_status)
    ) {
      return NextResponse.json(
        { error: "Internal plan is already active for this organization" },
        { status: 400 },
      );
    }

    const stripeCustomerId = billing?.stripe_customer_id;
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe customer found for this organization" },
        { status: 400 },
      );
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    if (
      setupIntent.status !== "succeeded" ||
      setupIntent.customer !== stripeCustomerId
    ) {
      return NextResponse.json(
        { error: "Payment method setup did not succeed" },
        { status: 400 },
      );
    }

    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
    if (!paymentMethodId) {
      return NextResponse.json(
        { error: "No payment method on setup intent" },
        { status: 400 },
      );
    }

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const internalPlanPriceId = process.env.STRIPE_INTERNAL_PLAN_PRICE_ID;
    if (!internalPlanPriceId) {
      return NextResponse.json(
        { error: "STRIPE_INTERNAL_PLAN_PRICE_ID is not configured" },
        { status: 500 },
      );
    }

    const trialDays = parseInt(process.env.STRIPE_TRIAL_DAYS ?? "7", 10);

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: internalPlanPriceId }],
      default_payment_method: paymentMethodId,
      trial_period_days: trialDays,
      discounts: promotionCodeId
        ? [{ promotion_code: promotionCodeId }]
        : undefined,
      metadata: { organizationId, purpose: "first_material_line" },
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
    });

    // Optimistically reflect the subscription state so the next page load
    // doesn't bounce the user back to the trial step before the webhook fires.
    await service.from("organization_billing_accounts").upsert({
      organization_id: organizationId,
      stripe_customer_id: stripeCustomerId,
      internal_plan_status:
        subscription.status === "trialing" ? "trialing" : subscription.status,
      internal_plan_subscription_id: subscription.id,
    });

    return NextResponse.json({ ok: true, subscriptionId: subscription.id });
  } catch (error) {
    console.error("Trial confirm error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to start trial";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
