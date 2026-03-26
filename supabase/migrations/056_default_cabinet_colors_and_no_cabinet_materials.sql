-- Default cabinet paint colors for every material line (replaces existing Cabinets entry).
-- Remove legacy cabinet material rows (image-based); cabinets are color-only via category_colors.
-- Enforce: no new materials with material_category = 'Cabinets'.

-- ============================================
-- 1) Remove cabinet material image rows
-- ============================================
DELETE FROM materials
WHERE material_category = 'Cabinets';

-- ============================================
-- 2) Seed default Cabinets colors on all material lines
-- ============================================
UPDATE material_lines
SET category_colors = jsonb_set(
  COALESCE(category_colors, '{}'::jsonb),
  '{Cabinets}',
  '[
    {"name": "Pure White", "hex": "#FFFFFF"},
    {"name": "Soft White", "hex": "#F2F0EB"},
    {"name": "Antique White", "hex": "#EBE6DC"},
    {"name": "Cream", "hex": "#F0E6D2"},
    {"name": "Light Gray", "hex": "#C8C8C8"},
    {"name": "Greige", "hex": "#A8A29E"},
    {"name": "Warm Taupe", "hex": "#8B7355"},
    {"name": "Charcoal", "hex": "#4A4A4A"},
    {"name": "Espresso", "hex": "#3E2723"},
    {"name": "True Black", "hex": "#1A1A1A"},
    {"name": "Navy", "hex": "#1E3A5F"},
    {"name": "Slate Blue", "hex": "#4A6B8A"},
    {"name": "Sage", "hex": "#9CAF88"},
    {"name": "Hunter Green", "hex": "#2D4A3E"}
  ]'::jsonb,
  true
);

COMMENT ON COLUMN material_lines.category_colors IS
  'Per-category options; Cabinets holds paint swatches (name + hex). Cabinet finishes are color-only—no materials rows for Cabinets.';

-- ============================================
-- 3) Block image-based cabinet materials at DB level
-- ============================================
CREATE OR REPLACE FUNCTION prevent_cabinet_material_images()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.material_category = 'Cabinets' THEN
    RAISE EXCEPTION
      USING MESSAGE = 'Cabinet finishes are color-only. Set cabinet colors on the material line (category_colors.Cabinets), not materials.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS materials_no_cabinet_category ON materials;
CREATE TRIGGER materials_no_cabinet_category
  BEFORE INSERT OR UPDATE OF material_category ON materials
  FOR EACH ROW
  EXECUTE FUNCTION prevent_cabinet_material_images();
