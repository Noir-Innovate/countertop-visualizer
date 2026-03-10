-- Standalone color options per category, stored at the material-line level.
-- Format: {"Cabinets": [{"name": "Navy Blue", "hex": "#1e3a5f"}, ...]}
ALTER TABLE material_lines
  ADD COLUMN IF NOT EXISTS category_colors JSONB DEFAULT NULL;
