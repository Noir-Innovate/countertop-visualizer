export const INTERNAL_LINE_MONTHLY_PRICE_CENTS = 25000;
export const DEFAULT_LEAD_PRICE_CENTS = 5000;

export function startOfCurrentUtcMonth(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();
}

export function centsToUsd(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

// Normalize any Stripe recurring price line into a monthly amount in cents.
function lineToMonthlyCents(
  unitAmount: number | null | undefined,
  quantity: number | null | undefined,
  interval: string | null | undefined,
  intervalCount: number | null | undefined,
): number {
  if (!unitAmount || unitAmount <= 0) return 0;
  const qty = quantity && quantity > 0 ? quantity : 1;
  const count = intervalCount && intervalCount > 0 ? intervalCount : 1;
  const line = unitAmount * qty;
  switch (interval) {
    case "day":
      return Math.round((line * 30) / count);
    case "week":
      return Math.round((line * 52) / 12 / count);
    case "month":
      return Math.round(line / count);
    case "year":
      return Math.round(line / (12 * count));
    default:
      return line;
  }
}

// Sum the monthly recurring cost (cents) across every item on a Stripe
// subscription, normalizing yearly/weekly/daily intervals to monthly.
export function subscriptionMonthlyCents(subscription: any): number {
  if (!subscription || typeof subscription !== "object") return 0;
  let total = 0;
  for (const item of subscription.items?.data ?? []) {
    const price = item?.price;
    total += lineToMonthlyCents(
      price?.unit_amount,
      item?.quantity,
      price?.recurring?.interval ?? null,
      price?.recurring?.interval_count ?? null,
    );
  }
  return total;
}
