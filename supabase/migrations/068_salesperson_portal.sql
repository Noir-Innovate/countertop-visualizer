-- Salesperson portal: extend leads, add per-line assignments, invite line scoping,
-- and a per-line access-mode column for the upcoming internal-line lockdown.

-- ============================================
-- LEADS: salesperson, GPS, notes, source
-- ============================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS salesperson_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'customer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_source_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_source_check
      CHECK (source IN ('customer', 'salesperson'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_salesperson
  ON leads(salesperson_id, material_line_id, created_at DESC)
  WHERE salesperson_id IS NOT NULL;

-- ============================================
-- SALESPERSON LINE ASSIGNMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS salesperson_line_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  material_line_id UUID NOT NULL REFERENCES material_lines(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, material_line_id)
);

CREATE INDEX IF NOT EXISTS idx_sla_profile ON salesperson_line_assignments(profile_id);
CREATE INDEX IF NOT EXISTS idx_sla_material_line ON salesperson_line_assignments(material_line_id);
CREATE INDEX IF NOT EXISTS idx_sla_organization ON salesperson_line_assignments(organization_id);

ALTER TABLE salesperson_line_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on salesperson_line_assignments"
  ON salesperson_line_assignments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Salesperson can read own assignments"
  ON salesperson_line_assignments
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Org owners/admins can read org assignments"
  ON salesperson_line_assignments
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org owners/admins can insert assignments"
  ON salesperson_line_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org owners/admins can delete assignments"
  ON salesperson_line_assignments
  FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- ORGANIZATION_INVITATIONS: assigned lines
-- ============================================
ALTER TABLE organization_invitations
  ADD COLUMN IF NOT EXISTS assigned_material_line_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- ============================================
-- MATERIAL_LINES: phased internal access mode
-- ============================================
ALTER TABLE material_lines
  ADD COLUMN IF NOT EXISTS internal_access_mode TEXT NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_lines_internal_access_mode_check'
  ) THEN
    ALTER TABLE material_lines
      ADD CONSTRAINT material_lines_internal_access_mode_check
      CHECK (internal_access_mode IN ('public', 'authenticated', 'invite_only'));
  END IF;
END $$;

-- ============================================
-- LEADS RLS: restrict salespeople to own jobs on assigned lines;
-- non-salesperson org members keep full org visibility.
-- ============================================
DROP POLICY IF EXISTS "Org members can view leads" ON leads;

CREATE POLICY "Non-sales org members can view org leads"
  ON leads
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
      AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Salesperson can view own leads on assigned lines"
  ON leads
  FOR SELECT
  TO authenticated
  USING (
    salesperson_id = auth.uid()
    AND material_line_id IN (
      SELECT material_line_id FROM salesperson_line_assignments
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Salesperson can insert own leads on assigned lines"
  ON leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    salesperson_id = auth.uid()
    AND source = 'salesperson'
    AND material_line_id IN (
      SELECT material_line_id FROM salesperson_line_assignments
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Salesperson can update own leads"
  ON leads
  FOR UPDATE
  TO authenticated
  USING (salesperson_id = auth.uid())
  WITH CHECK (salesperson_id = auth.uid());
