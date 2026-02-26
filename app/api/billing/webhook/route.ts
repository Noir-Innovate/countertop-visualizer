import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
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

function unixToIso(unixTimestamp: number | null | undefined) {
  if (!unixTimestamp) return null;
  return new Date(unixTimestamp * 1000).toISOString();
}

async function upsertSubscriptionState(
  supabase: any,
  organizationId: string,
  subscription: any,
) {
  await supabase.from("organization_billing_accounts").upsert({
    organization_id: organizationId,
    stripe_customer_id:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    internal_plan_status: normalizeInternalPlanStatus(subscription.status),
    internal_plan_subscription_id: subscription.id,
    internal_plan_current_period_end: unixToIso(
      subscription.current_period_end,
    ),
    internal_plan_cancel_at_period_end: subscription.cancel_at_period_end,
  });

  await supabase.from("organization_billing_subscriptions").upsert(
    {
      organization_id: organizationId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: unixToIso(subscription.current_period_start),
      current_period_end: unixToIso(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    {
      onConflict: "stripe_subscription_id",
    },
  );
}

async function resolveOrganizationIdForSubscription(
  supabase: any,
  subscription: any,
) {
  const metadataOrgId = subscription.metadata?.organizationId;
  if (metadataOrgId) return metadataOrgId;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  if (!customerId) return null;

  const { data: billingAccount } = await supabase
    .from("organization_billing_accounts")
    .select("organization_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return billingAccount?.organization_id ?? null;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret is not configured" },
      { status: 500 },
    );
  }

  const stripe = getStripeServerClient();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const organizationId = session.metadata?.organizationId;
        if (
          organizationId &&
          session.mode === "setup" &&
          session.metadata?.purpose === "lead_billing_setup"
        ) {
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;
          if (customerId) {
            await supabase.from("organization_billing_accounts").upsert({
              organization_id: organizationId,
              stripe_customer_id: customerId,
              lead_terms_accepted_at: new Date().toISOString(),
              billing_method_added_at: new Date().toISOString(),
            });
          }
        }

        if (organizationId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          await upsertSubscriptionState(supabase, organizationId, subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;
        const organizationId = await resolveOrganizationIdForSubscription(
          supabase,
          subscription,
        );
        if (organizationId) {
          await upsertSubscriptionState(supabase, organizationId, subscription);
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subscriptionId) {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
          const organizationId = await resolveOrganizationIdForSubscription(
            supabase,
            subscription,
          );
          if (organizationId) {
            await upsertSubscriptionState(
              supabase,
              organizationId,
              subscription,
            );
          }
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handling error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
