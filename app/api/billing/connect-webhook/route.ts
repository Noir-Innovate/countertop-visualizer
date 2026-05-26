import { NextRequest, NextResponse } from "next/server";
import { getStripeServerClient } from "@/lib/stripe";
import { syncAccountStatus } from "@/lib/stripe-connect";

// Stripe V2 event destination webhook for Connect (recipient) accounts.
// Configure in Dashboard → Developers → Workbench → Event destinations → V2,
// targeting this URL with at least the `v2.core.account.updated` event.

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Connect webhook secret is not configured" },
      { status: 500 },
    );
  }

  const stripe = getStripeServerClient();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let notification;
  try {
    notification = stripe.parseEventNotification(body, signature, secret);
  } catch (err) {
    console.error("Connect webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (notification.type) {
      case "v2.core.account.updated": {
        const accountId = notification.related_object?.id;
        if (accountId) await syncAccountStatus(accountId);
        break;
      }
      default:
        // Unhandled V2 event type — ack and move on.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Connect webhook handling error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
