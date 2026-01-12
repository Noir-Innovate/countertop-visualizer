-- Add Materials Table Migration
-- This migration adds support for storing material metadata (title, description) linked to material lines

-- ============================================
-- MATERIALS TABLE
-- Stores metadata for materials uploaded to material lines
-- ============================================
CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_line_id UUID NOT NULL REFERENCES material_lines(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  title TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(material_line_id, filename)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_materials_material_line ON materials(material_line_id);
CREATE INDEX IF NOT EXISTS idx_materials_filename ON materials(filename);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON materials(created_at DESC);

-- Enable Row Level Security
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR MATERIALS
-- ============================================
-- Service role can do everything
CREATE POLICY "Service role full access on materials" 
  ON materials 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Anyone can view materials (for public visualizer access)
CREATE POLICY "Anyone can view materials" 
  ON materials 
  FOR SELECT 
  TO anon, authenticated 
  USING (true);

-- Organization owners/admins can insert materials for their material lines
CREATE POLICY "Org admins can insert materials" 
  ON materials 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    material_line_id IN (
      SELECT ml.id FROM material_lines ml
      INNER JOIN organization_members om ON ml.organization_id = om.organization_id
      WHERE om.profile_id = auth.uid() 
      AND om.role IN ('owner', 'admin')
    )
  );

-- Organization owners/admins can update materials for their material lines
CREATE POLICY "Org admins can update materials" 
  ON materials 
  FOR UPDATE 
  TO authenticated 
  USING (
    material_line_id IN (
      SELECT ml.id FROM material_lines ml
      INNER JOIN organization_members om ON ml.organization_id = om.organization_id
      WHERE om.profile_id = auth.uid() 
      AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    material_line_id IN (
      SELECT ml.id FROM material_lines ml
      INNER JOIN organization_members om ON ml.organization_id = om.organization_id
      WHERE om.profile_id = auth.uid() 
      AND om.role IN ('owner', 'admin')
    )
  );

-- Organization owners/admins can delete materials for their material lines
CREATE POLICY "Org admins can delete materials" 
  ON materials 
  FOR DELETE 
  TO authenticated 
  USING (
    material_line_id IN (
      SELECT ml.id FROM material_lines ml
      INNER JOIN organization_members om ON ml.organization_id = om.organization_id
      WHERE om.profile_id = auth.uid() 
      AND om.role IN ('owner', 'admin')
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW
  EXECUTE FUNCTION update_materials_updated_at();

