-- Create storage bucket for public-assets
-- This migration creates the bucket and sets up storage policies

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-assets',
  'public-assets',
  true,
  26214400, -- 25MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for public-assets bucket

-- 1. Public Read Access (SELECT) - Allow anyone to view material images
CREATE POLICY "Public can read all materials"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'public-assets');

-- 2. Authenticated Read Access (SELECT) - Also allow authenticated users
CREATE POLICY "Authenticated can read all materials"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'public-assets');

-- 3. Org members can upload to their org folder (INSERT)
CREATE POLICY "Org members can upload to their org folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public-assets' AND
  (storage.foldername(name))[1] IN (
    SELECT slug FROM organizations 
    WHERE id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  )
);

-- 4. Org members can update files in their org folder (UPDATE)
CREATE POLICY "Org members can update files in their org folder"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'public-assets' AND
  (storage.foldername(name))[1] IN (
    SELECT slug FROM organizations 
    WHERE id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  )
)
WITH CHECK (
  bucket_id = 'public-assets' AND
  (storage.foldername(name))[1] IN (
    SELECT slug FROM organizations 
    WHERE id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  )
);

-- 5. Org members can delete files in their org folder (DELETE)
CREATE POLICY "Org members can delete files in their org folder"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'public-assets' AND
  (storage.foldername(name))[1] IN (
    SELECT slug FROM organizations 
    WHERE id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  )
);

