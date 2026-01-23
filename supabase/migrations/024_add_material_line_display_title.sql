-- Add Display Title Migration
-- This migration adds display_title to material_lines for public-facing display
-- The existing 'name' field will be used for internal/admin purposes

-- ============================================
-- MATERIAL LINES TABLE - Add display_title
-- ============================================
ALTER TABLE material_lines
  ADD COLUMN IF NOT EXISTS display_title TEXT;

-- Set display_title to name for existing records (can be updated later)
UPDATE material_lines
SET display_title = name
WHERE display_title IS NULL;
