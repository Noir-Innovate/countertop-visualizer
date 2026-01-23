-- Add Material Type Column Migration
-- This migration adds a material_type column to replace description with a dropdown selection

-- ============================================
-- ADD MATERIAL_TYPE COLUMN
-- ============================================
ALTER TABLE materials ADD COLUMN IF NOT EXISTS material_type TEXT;

-- Note: description column is kept for backwards compatibility but will be deprecated
-- material_type will be used going forward
