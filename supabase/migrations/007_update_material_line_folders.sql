-- Update existing material lines to use new folder structure: {org-slug}/{material-line-slug}/
-- This migration updates the supabase_folder column for existing material lines

-- Function to update folder paths for existing material lines
DO $$
DECLARE
  ml_record RECORD;
  org_slug TEXT;
BEGIN
  -- Loop through all material lines
  FOR ml_record IN SELECT id, organization_id, slug FROM material_lines LOOP
    -- Get organization slug
    SELECT slug INTO org_slug FROM organizations WHERE id = ml_record.organization_id;
    
    -- Update folder path if org slug exists
    IF org_slug IS NOT NULL THEN
      UPDATE material_lines
      SET supabase_folder = org_slug || '/' || ml_record.slug
      WHERE id = ml_record.id
      AND supabase_folder != org_slug || '/' || ml_record.slug;
    END IF;
  END LOOP;
END $$;

