-- Add optional free resource settings to material_lines
-- Used to gate an optional post-"See It!" email capture modal.

ALTER TABLE material_lines
  ADD COLUMN IF NOT EXISTS free_resource_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS free_resource_title TEXT,
  ADD COLUMN IF NOT EXISTS free_resource_description TEXT,
  ADD COLUMN IF NOT EXISTS free_resource_email_subject TEXT,
  ADD COLUMN IF NOT EXISTS free_resource_email_body TEXT,
  ADD COLUMN IF NOT EXISTS free_resource_cta_label TEXT,
  ADD COLUMN IF NOT EXISTS free_resource_file_url TEXT,
  ADD COLUMN IF NOT EXISTS free_resource_file_name TEXT;
