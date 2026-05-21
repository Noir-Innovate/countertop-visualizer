-- Reset cached monthly amounts so they get re-pulled with discount-aware
-- logic (subscriptionMonthlyCentsAfterDiscount). Previous values were
-- computed from list price and ignored coupons like "100% off". The admin
-- revenue route will repopulate the column on next read, and the webhook
-- repopulates on every subsequent subscription event.
UPDATE organization_billing_subscriptions
  SET monthly_recurring_cents = NULL;
