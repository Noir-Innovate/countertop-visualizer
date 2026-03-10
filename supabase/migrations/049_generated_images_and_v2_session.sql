-- Generated images table for AI training and version history
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  material_line_id UUID REFERENCES material_lines(id) ON DELETE SET NULL,
  material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
  material_category TEXT NOT NULL,
  kitchen_image_path TEXT NOT NULL,
  input_image_path TEXT,
  output_image_path TEXT NOT NULL,
  generation_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_images_session
  ON generated_images (session_id, generation_order);
CREATE INDEX IF NOT EXISTS idx_generated_images_material_line
  ON generated_images (material_line_id, created_at DESC);

-- Link generated images to leads via session
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS v2_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_v2_session
  ON leads (v2_session_id) WHERE v2_session_id IS NOT NULL;
