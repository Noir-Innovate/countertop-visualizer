-- Referral program core schema:
-- - organization_referral_codes: per-org shareable code (only minted for paying orgs)
-- - referrals: tracks the relationship between a referrer org and a referee org
-- - referral_commissions: per-paid-invoice accruals (referrer-only visibility)
-- - referral_payouts: manual checks/Venmo we send out, recorded by super-admin

-- ============================================
-- TABLES
-- ============================================
CREATE TABLE IF NOT EXISTS organization_referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 6 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  referee_organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  referee_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  referee_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'churned')),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (referrer_organization_id <> referee_organization_id)
);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  referrer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  referee_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  invoice_amount_cents INTEGER NOT NULL CHECK (invoice_amount_cents >= 0),
  commission_amount_cents INTEGER NOT NULL CHECK (commission_amount_cents >= 0),
  commission_rate_bps INTEGER NOT NULL CHECK (commission_rate_bps >= 0),
  accrued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('check', 'venmo', 'wire', 'other')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals(referrer_organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_status
  ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer
  ON referral_commissions(referrer_organization_id, accrued_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referee
  ON referral_commissions(referee_organization_id, accrued_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_referrer
  ON referral_payouts(referrer_organization_id, paid_at DESC);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE organization_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_payouts ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on organization_referral_codes"
  ON organization_referral_codes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on referrals"
  ON referrals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on referral_commissions"
  ON referral_commissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on referral_payouts"
  ON referral_payouts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Org members can view their own referral code
CREATE POLICY "Members can view their org referral code"
  ON organization_referral_codes FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

-- Referrer org members and referee org members can both view referral rows
-- they're a party to. Writes are service-role only.
CREATE POLICY "Members can view referrals they are party to"
  ON referrals FOR SELECT TO authenticated
  USING (
    referrer_organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
    OR referee_organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

-- Commissions are referrer-only by design — referees must NEVER see how much
-- the referrer is making off of their invoices.
CREATE POLICY "Referrer members can view commissions"
  ON referral_commissions FOR SELECT TO authenticated
  USING (
    referrer_organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

-- Payouts visible to referrer-org members.
CREATE POLICY "Referrer members can view payouts"
  ON referral_payouts FOR SELECT TO authenticated
  USING (
    referrer_organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );
