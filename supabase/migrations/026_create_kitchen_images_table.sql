-- Create Kitchen Images Table
-- This migration creates a dedicated table for kitchen images with title support
-- Similar to the materials table structure

-- ============================================
-- KITCHEN_IMAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS kitchen_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_line_id UUID NOT NULL REFERENCES material_lines(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  title TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(material_line_id, filename)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_kitchen_images_material_line ON kitchen_images(material_line_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_images_order ON kitchen_images(material_line_id, "order");
CREATE INDEX IF NOT EXISTS idx_kitchen_images_created_at ON kitchen_images(created_at DESC);

-- Add comment to document the table
COMMENT ON TABLE kitchen_images IS 'Stores kitchen stock photos for material lines. Each material line can have up to 3 kitchen images that customers can use in Step 1 of the visualizer.';
COMMENT ON COLUMN kitchen_images.filename IS 'Filename stored in Supabase Storage under {org-slug}/{material-line-slug}/kitchens/{filename}';
COMMENT ON COLUMN kitchen_images.title IS 'Optional custom title for the kitchen image. If null, will auto-generate from filename.';
COMMENT ON COLUMN kitchen_images."order" IS 'Display order for kitchen images. Lower numbers appear first.';

-- ============================================
-- RLS POLICIES FOR KITCHEN_IMAGES
-- ============================================
-- Enable Row Level Security
ALTER TABLE kitchen_images ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access on kitchen_images" 
  ON kitchen_images 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Anyone can view kitchen images (for public visualizer access)
CREATE POLICY "Anyone can view kitchen_images" 
  ON kitchen_images 
  FOR SELECT 
  TO anon, authenticated 
  USING (true);

-- Organization owners/admins can insert kitchen images for their material lines
CREATE POLICY "Org admins can insert kitchen_images" 
  ON kitchen_images 
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

-- Organization owners/admins can update kitchen images for their material lines
CREATE POLICY "Org admins can update kitchen_images" 
  ON kitchen_images 
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

-- Organization owners/admins can delete kitchen images for their material lines
CREATE POLICY "Org admins can delete kitchen_images" 
  ON kitchen_images 
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

-- ============================================
-- TRIGGERS
-- ============================================
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_kitchen_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_kitchen_images_updated_at
  BEFORE UPDATE ON kitchen_images
  FOR EACH ROW
  EXECUTE FUNCTION update_kitchen_images_updated_at();

-- ============================================
-- REMOVE OLD COLUMN (if exists)
-- ============================================
-- Drop the kitchen_image_paths column from material_lines table since we now use a dedicated table
ALTER TABLE material_lines DROP COLUMN IF EXISTS kitchen_image_paths;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'kitchen_images'
  ) THEN
    RAISE EXCEPTION 'Failed to create kitchen_images table';
  END IF;
  
  RAISE NOTICE 'Kitchen images table created successfully with RLS policies';
END $$;
