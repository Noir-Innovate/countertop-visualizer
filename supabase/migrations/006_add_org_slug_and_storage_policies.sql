-- Add organization slug and update folder structure
-- This migration adds organization slugs and prepares for org-based folder structure

-- Add slug column to organizations table
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug) WHERE slug IS NOT NULL;

-- Generate slugs for existing organizations that don't have one
-- Function to generate slug from name
CREATE OR REPLACE FUNCTION generate_slug_from_name(name_text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(name_text, '[^a-z0-9]+', '-', 'g'));
END;
$$ LANGUAGE plpgsql;

-- Update existing organizations without slugs
DO $$
DECLARE
  org_record RECORD;
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER;
BEGIN
  FOR org_record IN SELECT id, name FROM organizations WHERE slug IS NULL LOOP
    base_slug := generate_slug_from_name(org_record.name);
    final_slug := base_slug;
    counter := 1;
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug) LOOP
      final_slug := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    
    UPDATE organizations SET slug = final_slug WHERE id = org_record.id;
  END LOOP;
END $$;

-- Drop the helper function
DROP FUNCTION IF EXISTS generate_slug_from_name(TEXT);

-- Note: Storage policies for Supabase Storage are managed via the Supabase Dashboard
-- or Storage API. The folder structure will be: {org-slug}/{material-line-slug}/
-- Storage policies should allow:
-- - INSERT: Only authenticated users who are owners/admins of the organization
-- - SELECT: Public (for serving images)
-- - UPDATE/DELETE: Only authenticated users who are owners/admins of the organization
