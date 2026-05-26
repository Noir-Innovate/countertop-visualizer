import Stripe from "stripe";
import { getStripeServerClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

// V2 Recipient accounts: Stripe hosts the onboarding flow that collects W9/SSN
// data and issues 1099-NECs at year-end. We send commissions via standard v1
// transfers (destination=acct_...), and Stripe automatically pays out the
// balance to the affiliate's bank account on its default schedule.

// The /v2/core/accounts API is in public preview, so every v2 call must
// override the SDK's default Stripe-Version with a preview one.
// Bump this when Stripe publishes a newer preview. See:
// https://docs.stripe.com/api/v2/core/accounts
const V2_PREVIEW_API_VERSION = "2026-04-22.preview";
const v2Opts = { apiVersion: V2_PREVIEW_API_VERSION } as const;

function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000"
  );
}

export interface ConnectAccountStatus {
  stripeAccountId: string | null;
  status: string | null; // 'incomplete' | 'active' | 'restricted'
  payoutsEnabled: boolean;
}

function deriveStatus(
  transfersStatus: string | undefined,
  payoutsStatus: string | undefined,
): { status: string; payoutsEnabled: boolean } {
  const enabled = transfersStatus === "active" && payoutsStatus === "active";
  if (enabled) return { status: "active", payoutsEnabled: true };
  if (transfersStatus === "restricted" || payoutsStatus === "restricted") {
    return { status: "restricted", payoutsEnabled: false };
  }
  return { status: "incomplete", payoutsEnabled: false };
}

/**
 * Lazy-create a Stripe V2 Recipient account for an affiliate. Idempotent on
 * the profile_id: re-calls return the existing account ID.
 */
export async function ensureAffiliateAccount(
  profileId: string,
  contactEmail: string,
): Promise<{ stripeAccountId: string }> {
  const service = await createServiceClient();
  const { data: existing } = await service
    .from("referrer_payout_profiles")
    .select("stripe_account_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing?.stripe_account_id) {
    return { stripeAccountId: existing.stripe_account_id };
  }

  const stripe = getStripeServerClient();
  const account = await stripe.v2.core.accounts.create(
    {
      contact_email: contactEmail,
      // Express dashboard: gives the affiliate a Stripe-hosted dashboard
      // (balance, payouts, bank account, 1099s) accessible via Login Links.
      // 'none' would block them from any self-serve UI at all.
      dashboard: "express",
      identity: { country: "US", entity_type: "individual" },
      defaults: {
        currency: "usd",
        locales: ["en-US"],
        // Platform is the merchant of record on the underlying customer
        // charges, so we collect fees and absorb losses — affiliates just
        // receive commission transfers.
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      include: ["configuration.recipient", "identity", "requirements"],
      metadata: { profile_id: profileId },
    } as Stripe.V2.Core.AccountCreateParams,
    v2Opts,
  );

  await service
    .from("referrer_payout_profiles")
    .upsert(
      {
        profile_id: profileId,
        stripe_account_id: account.id,
        stripe_account_status: "incomplete",
        stripe_payouts_enabled: false,
        payout_method: "stripe",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );

  return { stripeAccountId: account.id };
}

/**
 * Mint a single-use Stripe-hosted onboarding URL. The Account Link expires
 * after a few minutes; call this every time the affiliate clicks "Set up" or
 * "Continue setup".
 */
export async function createOnboardingAccountLink(
  stripeAccountId: string,
): Promise<{ url: string }> {
  const stripe = getStripeServerClient();
  const base = getAppBaseUrl();
  const link = await stripe.v2.core.accountLinks.create(
    {
      account: stripeAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          // Plain paths — adding query params here makes some auth/middleware
          // bounces drop them, then the user lands somewhere unexpected.
          return_url: `${base}/dashboard/account/affiliate`,
          refresh_url: `${base}/dashboard/account/affiliate`,
        },
      },
    },
    v2Opts,
  );
  return { url: link.url };
}

/**
 * Mint a single-use URL into the affiliate's Stripe Express dashboard.
 * They land on the Stripe-hosted dashboard where they can see balance,
 * payout history, update their bank account, and download 1099s.
 */
export async function createDashboardLoginLink(
  stripeAccountId: string,
): Promise<{ url: string }> {
  const stripe = getStripeServerClient();
  const link = await stripe.accounts.createLoginLink(stripeAccountId);
  return { url: link.url };
}

/**
 * Pull the latest capability statuses from Stripe and persist them. Called
 * from the Connect webhook on account.updated and on-demand from the
 * dashboard after the affiliate returns from onboarding.
 */
export async function syncAccountStatus(
  stripeAccountId: string,
): Promise<ConnectAccountStatus> {
  const stripe = getStripeServerClient();
  const account = await stripe.v2.core.accounts.retrieve(
    stripeAccountId,
    { include: ["configuration.recipient"] },
    v2Opts,
  );

  const caps =
    account.configuration?.recipient?.capabilities?.stripe_balance ?? {};
  const transfersStatus = caps.stripe_transfers?.status;
  const payoutsStatus = caps.payouts?.status;
  const { status, payoutsEnabled } = deriveStatus(
    transfersStatus,
    payoutsStatus,
  );

  const service = await createServiceClient();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    stripe_account_status: status,
    stripe_payouts_enabled: payoutsEnabled,
    updated_at: now,
  };

  if (payoutsEnabled) {
    const { data: row } = await service
      .from("referrer_payout_profiles")
      .select("stripe_onboarded_at")
      .eq("stripe_account_id", stripeAccountId)
      .maybeSingle();
    if (!row?.stripe_onboarded_at) update.stripe_onboarded_at = now;
  }

  await service
    .from("referrer_payout_profiles")
    .update(update)
    .eq("stripe_account_id", stripeAccountId);

  return { stripeAccountId, status, payoutsEnabled };
}

/**
 * Send a commission payout via Stripe transfer (platform balance → connected
 * account). Stripe then auto-pays out the balance to the affiliate's bank on
 * their schedule.
 */
export async function sendAffiliatePayout(input: {
  stripeAccountId: string;
  amountCents: number;
  profileId: string;
  idempotencyKey: string;
  note?: string;
}): Promise<Stripe.Transfer> {
  const stripe = getStripeServerClient();
  return stripe.transfers.create(
    {
      amount: input.amountCents,
      currency: "usd",
      destination: input.stripeAccountId,
      description: input.note ?? "Affiliate commission payout",
      metadata: { profile_id: input.profileId },
    },
    { idempotencyKey: input.idempotencyKey },
  );
}
