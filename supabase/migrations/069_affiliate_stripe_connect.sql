-- Switch affiliate payouts from PayPal Payouts API to Stripe Connect (V2
-- Accounts API, recipient configuration). Stripe collects tax info during
-- hosted onboarding and issues 1099-NECs at year-end, so we drop our own
-- W9-collection gate from the app code (migration leaves the column in place
-- for historical reference; new app code ignores it).
--
-- Existing PayPal rows are preserved for audit. The CHECK constraints are
-- widened to allow 'stripe' alongside the legacy values. Affiliates with
-- prior PayPal-based payout setups are forced to complete Stripe onboarding
-- before their next payout — gating happens at the application layer on
-- stripe_payouts_enabled.

-- ============================================
-- referrer_payout_profiles: add Stripe Connect columns
-- ============================================
ALTER TABLE referrer_payout_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_account_status TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_onboarded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_referrer_payout_profiles_stripe_account
  ON referrer_payout_profiles(stripe_account_id);

-- Allow 'stripe' as a payout method going forward. Old 'paypal' rows still
-- validate; new code only writes 'stripe'.
ALTER TABLE referrer_payout_profiles
  DROP CONSTRAINT IF EXISTS referrer_payout_profiles_payout_method_check;

ALTER TABLE referrer_payout_profiles
  ADD CONSTRAINT referrer_payout_profiles_payout_method_check
  CHECK (payout_method IS NULL OR payout_method IN ('paypal', 'stripe'));

-- ============================================
-- referral_payouts: add Stripe transfer linkage
-- ============================================
ALTER TABLE referral_payouts
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_payout_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_status TEXT;

CREATE INDEX IF NOT EXISTS idx_referral_payouts_stripe_transfer
  ON referral_payouts(stripe_transfer_id);

ALTER TABLE referral_payouts
  DROP CONSTRAINT IF EXISTS referral_payouts_method_check;

ALTER TABLE referral_payouts
  ADD CONSTRAINT referral_payouts_method_check
  CHECK (method IN ('check', 'venmo', 'wire', 'paypal', 'stripe', 'other'));
