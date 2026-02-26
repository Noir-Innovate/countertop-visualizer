import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getStripeServerClient } from "@/lib/stripe";

interface CheckoutRequestBody {
  organizationId: string;
}

export async function POST(request: NextRequest) {
  try {
    const { organizationId } = (await request.json()) as CheckoutRequestBody;
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
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

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: existingBillingAccount } = await serviceClient
      .from("organization_billing_accounts")
      .select(
        "organization_id, stripe_customer_id, internal_plan_status, internal_plan_subscription_id",
      )
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (
      existingBillingAccount?.internal_plan_status &&
      ["active", "trialing", "past_due"].includes(
        existingBillingAccount.internal_plan_status,
      )
    ) {
      return NextResponse.json(
        { error: "Internal plan is already active for this organization" },
        { status: 400 },
      );
    }

    const stripe = getStripeServerClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const internalPlanPriceId = process.env.STRIPE_INTERNAL_PLAN_PRICE_ID;

    if (!internalPlanPriceId) {
      return NextResponse.json(
        { error: "STRIPE_INTERNAL_PLAN_PRICE_ID is not configured" },
        { status: 500 },
      );
    }

    let stripeCustomerId = existingBillingAccount?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: org?.name || `Organization ${organizationId}`,
        metadata: {
          organizationId,
        },
      });
      stripeCustomerId = customer.id;

      await serviceClient.from("organization_billing_accounts").upsert({
        organization_id: organizationId,
        stripe_customer_id: stripeCustomerId,
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: internalPlanPriceId,
          quantity: 1,
        },
      ],
      metadata: {
        organizationId,
      },
      subscription_data: {
        metadata: {
          organizationId,
        },
      },
      success_url: `${appUrl}/dashboard/organizations/${organizationId}/billing?checkout=success`,
      cancel_url: `${appUrl}/dashboard/organizations/${organizationId}/billing?checkout=cancel`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Billing checkout error:", error);
    return NextResponse.json(
      { error: "Failed to initialize billing checkout" },
      { status: 500 },
    );
  }
}
