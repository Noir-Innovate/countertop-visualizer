-- Add original image fields to leads table
-- This migration adds support for storing the original kitchen image alongside the generated visualization

-- ============================================
-- ADD ORIGINAL IMAGE COLUMNS TO LEADS TABLE
-- ============================================
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS original_image_url TEXT,
  ADD COLUMN IF NOT EXISTS original_image_storage_path TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_original_image_storage_path ON leads(original_image_storage_path) WHERE original_image_storage_path IS NOT NULL;

