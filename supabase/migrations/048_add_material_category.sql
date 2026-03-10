-- Add material_category to materials table
-- Supports: 'Cabinets', 'Countertops', 'Walls', 'Flooring'

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS material_category TEXT NOT NULL DEFAULT 'Countertops';

-- Backfill all existing materials
UPDATE materials SET material_category = 'Countertops' WHERE material_category IS NULL;

-- Drop the old unique constraint on (material_line_id, order) and replace with per-category ordering
ALTER TABLE materials DROP CONSTRAINT IF EXISTS unique_material_line_order;
ALTER TABLE materials ADD CONSTRAINT unique_material_line_category_order
  UNIQUE (material_line_id, material_category, "order");

-- Index for efficient category-scoped queries
CREATE INDEX IF NOT EXISTS idx_materials_line_category
  ON materials (material_line_id, material_category, "order");
