import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getStripeServerClient } from "@/lib/stripe";

function normalizeInternalPlanStatus(status: string | null | undefined) {
  if (!status) return "inactive";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  if (status === "canceled" || status === "unpaid") return "canceled";
  if (status === "active") return "active";
  return "inactive";
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    const lineKind = request.nextUrl.searchParams.get("lineKind");

    if (!organizationId || !sessionId || !lineKind) {
      return NextResponse.json(
        { error: "organizationId, sessionId, and lineKind are required" },
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
        { error: "You do not have permission to confirm billing onboarding" },
        { status: 403 },
      );
    }

    const stripe = getStripeServerClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["setup_intent", "subscription"],
    });

    if (session.status !== "complete") {
      return NextResponse.json(
        { error: "Checkout session is not complete" },
        { status: 400 },
      );
    }

    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing Stripe customer on checkout session" },
        { status: 400 },
      );
    }

    if (lineKind === "external") {
      const paymentMethods = await stripe.customers.listPaymentMethods(
        customerId,
        {
          type: "card",
          limit: 1,
        },
      );
      if (!paymentMethods.data.length) {
        return NextResponse.json(
          { error: "No card was added during billing setup" },
          { status: 400 },
        );
      }

      await serviceClient.from("organization_billing_accounts").upsert({
        organization_id: organizationId,
        stripe_customer_id: customerId,
        lead_terms_accepted_at: new Date().toISOString(),
        lead_terms_accepted_by: user.id,
        billing_method_added_at: new Date().toISOString(),
      });

      return NextResponse.json({ success: true });
    }

    if (lineKind === "internal") {
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!subscriptionId) {
        return NextResponse.json(
          { error: "No subscription found in checkout session" },
          { status: 400 },
        );
      }

      const subscriptionResponse =
        await stripe.subscriptions.retrieve(subscriptionId);
      const subscription: any =
        subscriptionResponse &&
        typeof subscriptionResponse === "object" &&
        "data" in subscriptionResponse
          ? (subscriptionResponse as any).data
          : subscriptionResponse;
      await serviceClient.from("organization_billing_accounts").upsert({
        organization_id: organizationId,
        stripe_customer_id: customerId,
        internal_plan_status: normalizeInternalPlanStatus(subscription.status),
        internal_plan_subscription_id: subscription.id,
        internal_plan_current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
        internal_plan_cancel_at_period_end: subscription.cancel_at_period_end,
      });

      await serviceClient.from("organization_billing_subscriptions").upsert(
        {
          organization_id: organizationId,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          current_period_start: subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000).toISOString()
            : null,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
        },
        { onConflict: "stripe_subscription_id" },
      );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid line kind" }, { status: 400 });
  } catch (error) {
    console.error("Billing onboarding confirm error:", error);
    return NextResponse.json(
      { error: "Failed to confirm billing onboarding" },
      { status: 500 },
    );
  }
}
