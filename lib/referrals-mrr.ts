import { createServiceClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/stripe";
import { getCommissionRateBps } from "@/lib/referrals";

export interface AffiliateMRR {
  grossMrrCents: number;
  commissionMrrCents: number;
  activeReferees: number;
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function computeAffiliateMRR(
  profileId: string,
): Promise<AffiliateMRR> {
  const service = (await createServiceClient()) as any;

  const { data: referrals } = await service
    .from("referrals")
    .select("referee_organization_id")
    .eq("referrer_profile_id", profileId)
    .eq("status", "active");

  const orgIds: string[] = (referrals ?? [])
    .map((r: { referee_organization_id: string | null }) => r.referee_organization_id)
    .filter((id: string | null): id is string => Boolean(id));

  if (orgIds.length === 0) {
    return { grossMrrCents: 0, commissionMrrCents: 0, activeReferees: 0 };
  }

  const { data: accounts } = await service
    .from("organization_billing_accounts")
    .select("organization_id, internal_plan_status, internal_plan_subscription_id")
    .in("organization_id", orgIds);

  const stripe = getStripeServerClient();
  let grossMrrCents = 0;
  let activeReferees = 0;

  for (const acct of accounts ?? []) {
    if (!ACTIVE_STATUSES.has(acct.internal_plan_status)) continue;
    if (!acct.internal_plan_subscription_id) continue;

    try {
      const sub = await stripe.subscriptions.retrieve(
        acct.internal_plan_subscription_id,
      );
      const monthly = monthlyValueCents(sub);
      if (monthly > 0) {
        grossMrrCents += monthly;
        activeReferees += 1;
      }
    } catch (err) {
      console.warn(
        `Failed to fetch subscription ${acct.internal_plan_subscription_id}`,
        err,
      );
    }
  }

  const rateBps = getCommissionRateBps();
  const commissionMrrCents = Math.floor((grossMrrCents * rateBps) / 10000);

  return { grossMrrCents, commissionMrrCents, activeReferees };
}

function monthlyValueCents(subscription: any): number {
  let total = 0;
  const items: any[] = subscription.items?.data ?? [];
  for (const item of items) {
    const price = item.price;
    if (!price?.unit_amount) continue;
    const qty = item.quantity ?? 1;
    const interval = price.recurring?.interval ?? "month";
    const intervalCount = price.recurring?.interval_count ?? 1;
    const perMonth = normalizeToMonthly(
      price.unit_amount * qty,
      interval,
      intervalCount,
    );
    total += perMonth;
  }
  return Math.round(total);
}

function normalizeToMonthly(
  amount: number,
  interval: string,
  intervalCount: number,
): number {
  const months =
    interval === "year"
      ? 12 * intervalCount
      : interval === "week"
        ? intervalCount / 4.345
        : interval === "day"
          ? intervalCount / 30
          : intervalCount;
  if (months <= 0) return 0;
  return amount / months;
}
