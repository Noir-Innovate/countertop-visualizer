-- Job workspaces: a job can have multiple parallel "rooms" (kitchen, bathroom,
-- etc.). Each workspace = one starting photo + a session_id under which all
-- generations cluster via generated_images.session_id.

CREATE TABLE IF NOT EXISTS job_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE,
  label TEXT,
  kitchen_image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_workspaces_lead
  ON job_workspaces(lead_id, created_at DESC);

ALTER TABLE job_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on job_workspaces"
  ON job_workspaces
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Salespeople can read their own workspaces (via lead ownership).
CREATE POLICY "Salesperson can read own workspaces"
  ON job_workspaces
  FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM leads WHERE salesperson_id = auth.uid()
    )
  );

CREATE POLICY "Salesperson can insert own workspaces"
  ON job_workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (
    lead_id IN (
      SELECT id FROM leads WHERE salesperson_id = auth.uid()
    )
  );

CREATE POLICY "Salesperson can update own workspaces"
  ON job_workspaces
  FOR UPDATE
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM leads WHERE salesperson_id = auth.uid()
    )
  )
  WITH CHECK (
    lead_id IN (
      SELECT id FROM leads WHERE salesperson_id = auth.uid()
    )
  );

CREATE POLICY "Salesperson can delete own workspaces"
  ON job_workspaces
  FOR DELETE
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM leads WHERE salesperson_id = auth.uid()
    )
  );

-- Org owners/admins can read all workspaces for jobs in their org (used by the
-- admin "Salesperson Jobs" views).
CREATE POLICY "Org admins can read org workspaces"
  ON job_workspaces
  FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM leads
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid()
        AND role IN ('owner', 'admin')
      )
    )
  );
