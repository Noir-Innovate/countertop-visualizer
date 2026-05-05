-- Onboarding website scrapes: track each scrape job and its result so the
-- onboarding wizard can resume across pages and recover from background failures.

CREATE TABLE IF NOT EXISTS org_onboarding_scrapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  -- Shape: {
  --   logoCandidates: string[],
  --   imageCandidates: string[],
  --   primaryColor: string|null,
  --   accentColor: string|null,
  --   backgroundColor: string|null,
  --   candidateMaterials: [{src_url, suggested_title, suggested_category, confidence}]
  -- }
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_onboarding_scrapes_org_created
  ON org_onboarding_scrapes(organization_id, created_at DESC);

DROP TRIGGER IF EXISTS update_org_onboarding_scrapes_updated_at
  ON org_onboarding_scrapes;
CREATE TRIGGER update_org_onboarding_scrapes_updated_at
  BEFORE UPDATE ON org_onboarding_scrapes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE org_onboarding_scrapes ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by background scrape worker + finalize).
CREATE POLICY "Service role full access on org_onboarding_scrapes"
  ON org_onboarding_scrapes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Org members can SELECT their own org's scrapes (so the wizard can poll).
CREATE POLICY "Org members can view org_onboarding_scrapes"
  ON org_onboarding_scrapes
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

-- Owners/admins can INSERT (create new scrape jobs) for their org.
CREATE POLICY "Org admins can insert org_onboarding_scrapes"
  ON org_onboarding_scrapes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
