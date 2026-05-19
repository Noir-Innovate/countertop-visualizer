-- CRM integrations (initial provider: GoHighLevel)
-- One row per (organization, provider). Material lines opt-in per-line via ghl_push_enabled.

CREATE TABLE IF NOT EXISTS crm_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('ghl')),
  location_id TEXT NOT NULL,
  api_token TEXT NOT NULL,             -- encrypted at rest (aes-256-gcm, see lib/crypto.ts)
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_tested_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_crm_integrations_org ON crm_integrations(organization_id);

ALTER TABLE material_lines
  ADD COLUMN IF NOT EXISTS ghl_push_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;

-- Org owners/admins can view their org's integrations
CREATE POLICY "Org admins can view crm integrations"
  ON crm_integrations
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Writes go through API routes that use the service role, so no insert/update/delete
-- policy is needed for authenticated users. Service role bypasses RLS.

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_crm_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_integrations_updated_at ON crm_integrations;
CREATE TRIGGER trg_crm_integrations_updated_at
  BEFORE UPDATE ON crm_integrations
  FOR EACH ROW EXECUTE FUNCTION set_crm_integrations_updated_at();
