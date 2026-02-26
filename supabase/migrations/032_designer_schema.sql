-- Designer Tool Schema
-- Adds price_per_sqft to materials and creates designs table for storing designer sessions

-- ============================================
-- ADD PRICE_PER_SQFT TO MATERIALS
-- ============================================
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS price_per_sqft DECIMAL(10, 2);

COMMENT ON COLUMN materials.price_per_sqft IS 'Price per square foot for quoting (nullable = contact for quote)';

-- ============================================
-- DESIGNS TABLE
-- Stores designer sessions/projects for layout, slab, cabinet choices
-- ============================================
CREATE TABLE IF NOT EXISTS designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_line_id UUID REFERENCES material_lines(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  layout_json JSONB NOT NULL DEFAULT '{}',
  slab_id TEXT,
  slab_name TEXT,
  cabinet_style TEXT,
  cabinet_color TEXT,
  total_sqft DECIMAL(10, 4),
  quote_amount DECIMAL(12, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_designs_material_line ON designs(material_line_id) WHERE material_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_designs_organization ON designs(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_designs_created_at ON designs(created_at DESC);

-- Enable RLS
ALTER TABLE designs ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on designs"
  ON designs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anyone can insert (anonymous designs)
CREATE POLICY "Anyone can insert designs"
  ON designs FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Org members can view their org's designs
CREATE POLICY "Org members can view designs"
  ON designs FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
    OR organization_id IS NULL
  );

-- Org admins can update/delete their org's designs
CREATE POLICY "Org admins can update designs"
  ON designs FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (true);

CREATE POLICY "Org admins can delete designs"
  ON designs FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_designs_updated_at
  BEFORE UPDATE ON designs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
