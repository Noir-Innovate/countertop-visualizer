-- Persist the monthly recurring amount (in cents) for each Stripe subscription
-- so the admin revenue dashboard can compute totals without per-request Stripe
-- API calls. Populated by the webhook + onboarding-confirm flows and
-- back-filled lazily by the admin revenue route when missing.
ALTER TABLE organization_billing_subscriptions
  ADD COLUMN IF NOT EXISTS monthly_recurring_cents INTEGER
  CHECK (monthly_recurring_cents IS NULL OR monthly_recurring_cents >= 0);
