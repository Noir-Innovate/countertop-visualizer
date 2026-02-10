-- Create Tracking Links Table
-- Saved UTM/tag presets per material line so users can build and reuse tracking URLs for ads, social, etc.

-- ============================================
-- TRACKING_LINKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_line_id UUID NOT NULL REFERENCES material_lines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  tags JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_links_material_line ON tracking_links(material_line_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_created_at ON tracking_links(material_line_id, created_at DESC);

COMMENT ON TABLE tracking_links IS 'Saved tracking URL configs (UTM + tags) per material line for ads, social, and campaigns.';

-- ============================================
-- RLS POLICIES FOR TRACKING_LINKS
-- ============================================
ALTER TABLE tracking_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tracking_links"
  ON tracking_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Org members can view tracking links for their material lines
CREATE POLICY "Org members can view tracking_links"
  ON tracking_links
  FOR SELECT
  TO authenticated
  USING (
    material_line_id IN (
      SELECT id FROM material_lines
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid()
      )
    )
  );

-- Org members can insert tracking links for their material lines
CREATE POLICY "Org members can insert tracking_links"
  ON tracking_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    material_line_id IN (
      SELECT id FROM material_lines
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid()
      )
    )
  );

-- Org members can update tracking links for their material lines
CREATE POLICY "Org members can update tracking_links"
  ON tracking_links
  FOR UPDATE
  TO authenticated
  USING (
    material_line_id IN (
      SELECT id FROM material_lines
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    material_line_id IN (
      SELECT id FROM material_lines
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid()
      )
    )
  );

-- Org members can delete tracking links for their material lines
CREATE POLICY "Org members can delete tracking_links"
  ON tracking_links
  FOR DELETE
  TO authenticated
  USING (
    material_line_id IN (
      SELECT id FROM material_lines
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid()
      )
    )
  );
