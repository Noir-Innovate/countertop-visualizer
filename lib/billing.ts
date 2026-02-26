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
