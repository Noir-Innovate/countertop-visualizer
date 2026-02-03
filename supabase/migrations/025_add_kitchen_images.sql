-- Add Kitchen Images Support to Material Lines
-- This migration adds support for material lines to have custom kitchen stock photos
-- that will appear in Step 1 of the visualizer

-- ============================================
-- ADD KITCHEN_IMAGE_PATHS COLUMN
-- ============================================
ALTER TABLE material_lines
ADD COLUMN IF NOT EXISTS kitchen_image_paths TEXT[] DEFAULT '{}';

-- Add comment to document the column
COMMENT ON COLUMN material_lines.kitchen_image_paths IS 'Array of relative paths to kitchen images stored in public-assets bucket. Paths are relative to the material line folder (e.g., ["kitchens/kitchen-1.jpg", "kitchens/kitchen-2.png"]). Maximum 3 images.';

-- ============================================
-- STORAGE POLICIES
-- ============================================
-- Note: Existing storage policies for public-assets bucket already cover this use case:
-- 1. Public read access - allows anyone to view kitchen images
-- 2. Org admins/owners can upload to their {org-slug}/{material-line-slug}/ folder
-- 3. No additional policies needed since kitchens/ is a subfolder within material line folder

-- ============================================
-- VERIFICATION
-- ============================================
-- Verify the column was added successfully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'material_lines'
    AND column_name = 'kitchen_image_paths'
  ) THEN
    RAISE EXCEPTION 'Failed to add kitchen_image_paths column to material_lines table';
  END IF;
  
  RAISE NOTICE 'Kitchen images column added successfully to material_lines table';
END $$;
