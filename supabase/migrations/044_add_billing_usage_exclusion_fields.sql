-- Allow excluding specific lead usage rows from billing (e.g. test/demo leads)
ALTER TABLE organization_billing_usage
  ADD COLUMN IF NOT EXISTS excluded_from_billing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS billing_exclusion_reason TEXT,
  ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_billing_usage_excluded
  ON organization_billing_usage(organization_id, excluded_from_billing);
