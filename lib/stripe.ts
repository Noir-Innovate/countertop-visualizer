import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeServerClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2026-02-25.clover",
    });
  }

  return stripeClient;
}
