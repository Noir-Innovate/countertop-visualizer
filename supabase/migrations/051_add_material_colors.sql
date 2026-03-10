-- Optional color options for materials (used by Cabinets)
-- Format: [{"name": "Navy Blue", "hex": "#1e3a5f"}, ...]
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS available_colors JSONB DEFAULT NULL;

COMMENT ON COLUMN materials.available_colors IS
  'Optional JSON array of {name, hex} color options. When set, the v2 visualizer asks the user to pick a color before generating.';
