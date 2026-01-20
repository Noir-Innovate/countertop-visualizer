-- Add Material Order Column Migration
-- This migration adds an order field to materials table for custom ordering within material lines

-- ============================================
-- ADD ORDER COLUMN
-- ============================================
-- Add order column as nullable initially
ALTER TABLE materials ADD COLUMN IF NOT EXISTS "order" INTEGER;

-- Set default order values for existing materials based on created_at
-- Materials created first get lower order numbers
UPDATE materials
SET "order" = subquery.row_number
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY material_line_id ORDER BY created_at ASC, filename ASC) as row_number
  FROM materials
) AS subquery
WHERE materials.id = subquery.id;

-- Make order NOT NULL after setting defaults
ALTER TABLE materials ALTER COLUMN "order" SET NOT NULL;

-- Add unique constraint to prevent duplicate orders within a material line
ALTER TABLE materials ADD CONSTRAINT unique_material_line_order 
  UNIQUE(material_line_id, "order");

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS idx_materials_material_line_order 
  ON materials(material_line_id, "order");

-- Update the updated_at trigger function to fire on order changes
-- (The existing trigger already handles this, but we ensure it's set up correctly)
CREATE OR REPLACE FUNCTION update_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists (it should already exist from migration 012)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_materials_updated_at'
  ) THEN
    CREATE TRIGGER update_materials_updated_at
      BEFORE UPDATE ON materials
      FOR EACH ROW
      EXECUTE FUNCTION update_materials_updated_at();
  END IF;
END $$;
