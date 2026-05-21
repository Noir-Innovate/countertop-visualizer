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

// Sum the monthly recurring list-price cost (cents) across every item on a
// Stripe subscription, normalizing yearly/weekly/daily intervals to monthly.
// Does NOT account for discounts/coupons — see
// subscriptionMonthlyCentsAfterDiscount for that.
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

// Same as subscriptionMonthlyCents but applies the discount ratio from the
// upcoming Stripe invoice — so a 100% off coupon resolves to $0, a 20% off
// coupon resolves to 80% of list, etc. Falls back to list price if the
// preview can't be fetched.
export async function subscriptionMonthlyCentsAfterDiscount(
  stripe: any,
  subscription: any,
): Promise<number> {
  const listMonthly = subscriptionMonthlyCents(subscription);
  if (listMonthly <= 0) return 0;
  if (!subscription?.id || !stripe?.invoices?.createPreview) {
    return listMonthly;
  }
  try {
    const preview = await stripe.invoices.createPreview({
      subscription: subscription.id,
    });
    // subtotal: pre-discount, pre-tax line items.
    // total_excluding_tax: post-discount, pre-tax (preferred).
    // total: post-discount, post-tax (fallback when total_excluding_tax absent).
    const subtotal = Number(preview?.subtotal ?? 0);
    const postDiscount =
      preview?.total_excluding_tax != null
        ? Number(preview.total_excluding_tax)
        : Number(preview?.total ?? 0);
    if (subtotal <= 0) return listMonthly;
    const ratio = Math.max(0, postDiscount / subtotal);
    return Math.round(listMonthly * ratio);
  } catch (err) {
    console.error(
      `[billing] invoice preview failed for sub=${subscription.id}:`,
      err,
    );
    return listMonthly;
  }
}
