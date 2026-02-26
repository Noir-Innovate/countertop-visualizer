import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getStripeServerClient } from "@/lib/stripe";

interface OnboardingCheckoutBody {
  organizationId: string;
  lineKind: "external" | "internal";
  agreedToLeadBilling?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { organizationId, lineKind, agreedToLeadBilling } =
      (await request.json()) as OnboardingCheckoutBody;

    if (!organizationId || !lineKind) {
      return NextResponse.json(
        { error: "organizationId and lineKind are required" },
        { status: 400 },
      );
    }

    if (lineKind !== "external" && lineKind !== "internal") {
      return NextResponse.json({ error: "Invalid lineKind" }, { status: 400 });
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
        { error: "You do not have permission to create material lines" },
        { status: 403 },
      );
    }

    const { count: existingLineCount } = await supabase
      .from("material_lines")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const stripe = getStripeServerClient();
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: org } = await serviceClient
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    const { data: billingAccount } = await serviceClient
      .from("organization_billing_accounts")
      .select(
        "stripe_customer_id, internal_plan_status, billing_method_added_at, lead_terms_accepted_at",
      )
      .eq("organization_id", organizationId)
      .maybeSingle();

    let stripeCustomerId = billingAccount?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: org?.name || `Organization ${organizationId}`,
        metadata: { organizationId },
      });
      stripeCustomerId = customer.id;

      await serviceClient.from("organization_billing_accounts").upsert({
        organization_id: organizationId,
        stripe_customer_id: stripeCustomerId,
      });
    }

    const successUrl = `${appUrl}/dashboard/organizations/${organizationId}/material-lines/new?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/dashboard/organizations/${organizationId}/material-lines/new?checkout=cancel`;

    if (lineKind === "internal") {
      const hasActiveInternalPlan = ["active", "trialing", "past_due"].includes(
        billingAccount?.internal_plan_status || "",
      );
      if (hasActiveInternalPlan) {
        return NextResponse.json({ required: false });
      }

      const internalPlanPriceId = process.env.STRIPE_INTERNAL_PLAN_PRICE_ID;
      if (!internalPlanPriceId) {
        return NextResponse.json(
          { error: "STRIPE_INTERNAL_PLAN_PRICE_ID is not configured" },
          { status: 500 },
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: internalPlanPriceId, quantity: 1 }],
        metadata: { organizationId, lineKind, purpose: "first_material_line" },
        subscription_data: {
          metadata: {
            organizationId,
            lineKind,
            purpose: "first_material_line",
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      return NextResponse.json({ required: true, url: session.url });
    }

    // Lead lines require billing setup only for the first material line.
    if ((existingLineCount || 0) > 0) {
      return NextResponse.json({ required: false });
    }

    if (!agreedToLeadBilling) {
      return NextResponse.json(
        {
          error:
            "You must agree to per-lead billing terms before creating your first lead line",
        },
        { status: 400 },
      );
    }

    const hasLeadBillingSetup =
      Boolean(billingAccount?.billing_method_added_at) &&
      Boolean(billingAccount?.lead_terms_accepted_at);
    if (hasLeadBillingSetup) {
      return NextResponse.json({ required: false });
    }

    const setupSession = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      metadata: {
        organizationId,
        lineKind,
        purpose: "lead_billing_setup",
        agreedToLeadBilling: "true",
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ required: true, url: setupSession.url });
  } catch (error) {
    console.error("Billing onboarding checkout error:", error);
    return NextResponse.json(
      { error: "Failed to initialize billing onboarding" },
      { status: 500 },
    );
  }
}
