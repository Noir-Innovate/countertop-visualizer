-- Create leads storage bucket and update leads table schema
-- This migration creates a private bucket for lead images and adds storage path tracking

-- ============================================
-- CREATE LEADS STORAGE BUCKET
-- ============================================
-- Create the bucket if it doesn't exist (private bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leads',
  'leads',
  false, -- Private bucket - no public access
  10485760, -- 10MB in bytes (for kitchen images)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- UPDATE LEADS TABLE SCHEMA
-- ============================================
-- Add image_storage_path column to store the path in the leads bucket
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS image_storage_path TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_image_storage_path ON leads(image_storage_path) WHERE image_storage_path IS NOT NULL;

-- ============================================
-- STORAGE POLICIES FOR LEADS BUCKET
-- ============================================

-- 2. Org members can read images from their organization's folder
CREATE POLICY "Org members can read lead images" 
  ON storage.objects 
  FOR SELECT 
  TO authenticated 
  USING (
    bucket_id = 'leads' AND
    (storage.foldername(name))[1] IN (
      SELECT slug FROM organizations 
      WHERE id IN (
        SELECT organization_id FROM organization_members 
        WHERE profile_id = auth.uid()
      )
    )
  );

