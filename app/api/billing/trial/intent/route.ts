import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getStripeServerClient } from "@/lib/stripe";

interface Body {
  organizationId: string;
}

export async function POST(request: NextRequest) {
  try {
    const { organizationId } = (await request.json()) as Body;
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

    const stripe = getStripeServerClient();
    const service = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: org } = await service
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    const { data: existingBilling } = await service
      .from("organization_billing_accounts")
      .select("stripe_customer_id, internal_plan_status")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (
      existingBilling?.internal_plan_status &&
      ["active", "trialing", "past_due"].includes(
        existingBilling.internal_plan_status,
      )
    ) {
      return NextResponse.json(
        { error: "Internal plan is already active for this organization" },
        { status: 400 },
      );
    }

    let stripeCustomerId = existingBilling?.stripe_customer_id ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: org?.name || `Organization ${organizationId}`,
        email: user.email ?? undefined,
        metadata: { organizationId },
      });
      stripeCustomerId = customer.id;

      await service.from("organization_billing_accounts").upsert({
        organization_id: organizationId,
        stripe_customer_id: stripeCustomerId,
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { organizationId, purpose: "internal_plan_trial" },
    });

    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      publishableKey,
    });
  } catch (error) {
    console.error("Trial intent error:", error);
    return NextResponse.json(
      { error: "Failed to initialize trial setup" },
      { status: 500 },
    );
  }
}
