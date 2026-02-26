-- Org billing + internal material line support

-- ============================================
-- MATERIAL LINE KIND (IMMUTABLE)
-- ============================================
ALTER TABLE material_lines
  ADD COLUMN IF NOT EXISTS line_kind TEXT NOT NULL DEFAULT 'external';

UPDATE material_lines
SET line_kind = 'external'
WHERE line_kind IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'material_lines_line_kind_check'
  ) THEN
    ALTER TABLE material_lines
      ADD CONSTRAINT material_lines_line_kind_check
      CHECK (line_kind IN ('external', 'internal'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_material_line_kind_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.line_kind IS DISTINCT FROM NEW.line_kind THEN
    RAISE EXCEPTION 'material_lines.line_kind is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_lines_kind_immutable_trigger ON material_lines;
CREATE TRIGGER material_lines_kind_immutable_trigger
  BEFORE UPDATE ON material_lines
  FOR EACH ROW
  EXECUTE FUNCTION prevent_material_line_kind_update();

-- ============================================
-- ORGANIZATION BILLING TABLES
-- ============================================
CREATE TABLE IF NOT EXISTS organization_billing_accounts (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  internal_plan_status TEXT NOT NULL DEFAULT 'inactive' CHECK (
    internal_plan_status IN ('inactive', 'active', 'trialing', 'past_due', 'canceled')
  ),
  internal_plan_subscription_id TEXT UNIQUE,
  internal_plan_current_period_end TIMESTAMPTZ,
  internal_plan_cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_billing_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_price_cents INTEGER NOT NULL CHECK (lead_price_cents >= 0),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_billing_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  material_line_id UUID REFERENCES material_lines(id) ON DELETE SET NULL,
  lead_price_cents INTEGER NOT NULL CHECK (lead_price_cents >= 0),
  billed_amount_cents INTEGER NOT NULL CHECK (billed_amount_cents >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lead_id)
);

CREATE TABLE IF NOT EXISTS organization_billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_lines_line_kind
  ON material_lines(organization_id, line_kind);
CREATE INDEX IF NOT EXISTS idx_org_billing_pricing_org_effective
  ON organization_billing_pricing(organization_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_billing_usage_org_occurred
  ON organization_billing_usage(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_billing_subscriptions_org
  ON organization_billing_subscriptions(organization_id, created_at DESC);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE organization_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_billing_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_billing_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_billing_subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on organization_billing_accounts"
  ON organization_billing_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on organization_billing_pricing"
  ON organization_billing_pricing
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on organization_billing_usage"
  ON organization_billing_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on organization_billing_subscriptions"
  ON organization_billing_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Org members can read billing data
CREATE POLICY "Org members can view organization_billing_accounts"
  ON organization_billing_accounts
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view organization_billing_pricing"
  ON organization_billing_pricing
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view organization_billing_usage"
  ON organization_billing_usage
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view organization_billing_subscriptions"
  ON organization_billing_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

-- Org owners/admins can manage account + pricing records
CREATE POLICY "Org admins can upsert organization_billing_accounts"
  ON organization_billing_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can update organization_billing_accounts"
  ON organization_billing_accounts
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can insert organization_billing_pricing"
  ON organization_billing_pricing
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- UPDATED_AT triggers for new tables
DROP TRIGGER IF EXISTS update_organization_billing_accounts_updated_at
  ON organization_billing_accounts;
CREATE TRIGGER update_organization_billing_accounts_updated_at
  BEFORE UPDATE ON organization_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_billing_subscriptions_updated_at
  ON organization_billing_subscriptions;
CREATE TRIGGER update_organization_billing_subscriptions_updated_at
  BEFORE UPDATE ON organization_billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
