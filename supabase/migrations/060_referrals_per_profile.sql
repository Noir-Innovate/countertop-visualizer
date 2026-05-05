-- Refactor referrals from org-scoped to profile-scoped.
--
-- Why: an individual (designer, content creator, sales rep) should be able to
-- share the visualizer and earn commissions without owning a paying org. Also
-- adds a referrer_payout_profiles table so we can collect W9s and payout
-- details per person, and gates admin payouts on a collected W9.
--
-- Backwards compat: we keep referrer_organization_id columns on referrals/
-- commissions/payouts (now nullable) and backfill referrer_profile_id from
-- each org's owner. Old org-scoped reads remain valid; new code reads/writes
-- the profile column.

-- ============================================
-- New: per-profile referral codes
-- ============================================
CREATE TABLE IF NOT EXISTS profile_referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 6 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- New: payout profiles (W9 + how to send money)
-- ============================================
CREATE TABLE IF NOT EXISTS referrer_payout_profiles (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  legal_name TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  payout_method TEXT CHECK (
    payout_method IN ('check', 'venmo', 'wire', 'paypal', 'other')
  ),
  payout_handle TEXT,
  w9_storage_path TEXT,
  w9_collected_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Add referrer_profile_id to existing tables
-- ============================================
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS referrer_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE referrals ALTER COLUMN referrer_organization_id DROP NOT NULL;

ALTER TABLE referral_commissions
  ADD COLUMN IF NOT EXISTS referrer_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE referral_commissions ALTER COLUMN referrer_organization_id DROP NOT NULL;

ALTER TABLE referral_payouts
  ADD COLUMN IF NOT EXISTS referrer_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE referral_payouts ALTER COLUMN referrer_organization_id DROP NOT NULL;

-- ============================================
-- Backfill: org owners → profiles
-- ============================================
-- Each org's referral code → that org's owner profile.
INSERT INTO profile_referral_codes (profile_id, code, created_at)
SELECT DISTINCT ON (om.profile_id)
  om.profile_id, orc.code, orc.created_at
FROM organization_referral_codes orc
JOIN organization_members om
  ON om.organization_id = orc.organization_id
 AND om.role = 'owner'
ORDER BY om.profile_id, orc.created_at ASC
ON CONFLICT (profile_id) DO NOTHING;

UPDATE referrals r
SET referrer_profile_id = sub.profile_id
FROM (
  SELECT om.organization_id, om.profile_id
  FROM organization_members om
  WHERE om.role = 'owner'
) sub
WHERE r.referrer_profile_id IS NULL
  AND r.referrer_organization_id = sub.organization_id;

UPDATE referral_commissions c
SET referrer_profile_id = sub.profile_id
FROM (
  SELECT om.organization_id, om.profile_id
  FROM organization_members om
  WHERE om.role = 'owner'
) sub
WHERE c.referrer_profile_id IS NULL
  AND c.referrer_organization_id = sub.organization_id;

UPDATE referral_payouts p
SET referrer_profile_id = sub.profile_id
FROM (
  SELECT om.organization_id, om.profile_id
  FROM organization_members om
  WHERE om.role = 'owner'
) sub
WHERE p.referrer_profile_id IS NULL
  AND p.referrer_organization_id = sub.organization_id;

-- ============================================
-- Indexes for the new column
-- ============================================
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_profile
  ON referrals(referrer_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer_profile
  ON referral_commissions(referrer_profile_id, accrued_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_referrer_profile
  ON referral_payouts(referrer_profile_id, paid_at DESC);

-- ============================================
-- Rebuild referral_balances keyed on profile
-- ============================================
DROP VIEW IF EXISTS referral_balances;
CREATE VIEW referral_balances
WITH (security_invoker = true) AS
WITH accrued AS (
  SELECT
    referrer_profile_id,
    COALESCE(SUM(commission_amount_cents), 0)::BIGINT AS lifetime_accrued_cents,
    COALESCE(SUM(
      CASE
        WHEN accrued_at >= date_trunc('month', NOW())
        THEN commission_amount_cents
        ELSE 0
      END
    ), 0)::BIGINT AS this_month_accrued_cents
  FROM referral_commissions
  WHERE referrer_profile_id IS NOT NULL
  GROUP BY referrer_profile_id
),
paid AS (
  SELECT
    referrer_profile_id,
    COALESCE(SUM(amount_cents), 0)::BIGINT AS lifetime_paid_cents
  FROM referral_payouts
  WHERE referrer_profile_id IS NOT NULL
  GROUP BY referrer_profile_id
)
SELECT
  COALESCE(a.referrer_profile_id, p.referrer_profile_id) AS referrer_profile_id,
  COALESCE(a.lifetime_accrued_cents, 0) AS lifetime_accrued_cents,
  COALESCE(a.this_month_accrued_cents, 0) AS this_month_accrued_cents,
  COALESCE(p.lifetime_paid_cents, 0) AS lifetime_paid_cents,
  GREATEST(
    COALESCE(a.lifetime_accrued_cents, 0) - COALESCE(p.lifetime_paid_cents, 0),
    0
  ) AS unpaid_balance_cents
FROM accrued a
FULL OUTER JOIN paid p USING (referrer_profile_id);

-- ============================================
-- RLS — new tables
-- ============================================
ALTER TABLE profile_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrer_payout_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on profile_referral_codes"
  ON profile_referral_codes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Owners can view their own referral code"
  ON profile_referral_codes FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Service role full access on referrer_payout_profiles"
  ON referrer_payout_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Owners can view their own payout profile"
  ON referrer_payout_profiles FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Owners can upsert their own payout profile"
  ON referrer_payout_profiles FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Owners can update their own payout profile"
  ON referrer_payout_profiles FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ============================================
-- RLS — extend existing policies for the profile column
-- ============================================
DROP POLICY IF EXISTS "Members can view referrals they are party to" ON referrals;
CREATE POLICY "Profiles or org members can view referrals they are party to"
  ON referrals FOR SELECT TO authenticated
  USING (
    referrer_profile_id = auth.uid()
    OR referee_profile_id = auth.uid()
    OR referrer_organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
    OR referee_organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Referrer members can view commissions" ON referral_commissions;
CREATE POLICY "Referrer can view their commissions"
  ON referral_commissions FOR SELECT TO authenticated
  USING (
    referrer_profile_id = auth.uid()
    OR referrer_organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Referrer members can view payouts" ON referral_payouts;
CREATE POLICY "Referrer can view their payouts"
  ON referral_payouts FOR SELECT TO authenticated
  USING (
    referrer_profile_id = auth.uid()
    OR referrer_organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

-- ============================================
-- Storage bucket for W9 PDFs (private)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('w9-documents', 'w9-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Per-profile foldering: object name must start with "{auth.uid()}/..."
CREATE POLICY "Owners can upload their own W9"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'w9-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owners can read their own W9"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'w9-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
