-- Consolidate affiliate payouts to a single rail: PayPal Payouts API.
--
-- Why: the previous design let affiliates and admins pick from check/venmo/
-- wire/paypal/other, but every method was tracked manually. Going PayPal-only
-- lets us submit bulk payouts via API and removes the per-method admin
-- bookkeeping. Existing affiliates who selected a non-PayPal method are
-- forced to re-enter a PayPal email before their next payout.

-- ============================================
-- Tighten payout_method on referrer_payout_profiles → paypal only
-- ============================================

-- Wipe non-paypal selections so the CHECK can be tightened and so affiliates
-- are forced through the new PayPal-email flow.
UPDATE referrer_payout_profiles
SET payout_method = NULL,
    payout_handle = NULL,
    updated_at = NOW()
WHERE payout_method IS DISTINCT FROM 'paypal';

ALTER TABLE referrer_payout_profiles
  DROP CONSTRAINT IF EXISTS referrer_payout_profiles_payout_method_check;

ALTER TABLE referrer_payout_profiles
  ADD CONSTRAINT referrer_payout_profiles_payout_method_check
  CHECK (payout_method IS NULL OR payout_method = 'paypal');

-- ============================================
-- PayPal batch tracking
-- ============================================
CREATE TABLE IF NOT EXISTS paypal_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paypal_batch_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'partial', 'failed')),
  total_cents BIGINT NOT NULL CHECK (total_cents >= 0),
  item_count INTEGER NOT NULL CHECK (item_count > 0),
  created_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paypal_payout_batches_created
  ON paypal_payout_batches(created_at DESC);

ALTER TABLE paypal_payout_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on paypal_payout_batches"
  ON paypal_payout_batches FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- Per-payout PayPal linkage
-- ============================================
ALTER TABLE referral_payouts
  ADD COLUMN IF NOT EXISTS paypal_batch_id UUID
    REFERENCES paypal_payout_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paypal_item_id TEXT,
  ADD COLUMN IF NOT EXISTS paypal_status TEXT;

CREATE INDEX IF NOT EXISTS idx_referral_payouts_paypal_batch
  ON referral_payouts(paypal_batch_id);

-- Allow 'paypal' as a method going forward. Historical rows (check/venmo/
-- wire/other) remain valid; new app code will only insert 'paypal'.
ALTER TABLE referral_payouts
  DROP CONSTRAINT IF EXISTS referral_payouts_method_check;

ALTER TABLE referral_payouts
  ADD CONSTRAINT referral_payouts_method_check
  CHECK (method IN ('check', 'venmo', 'wire', 'paypal', 'other'));
