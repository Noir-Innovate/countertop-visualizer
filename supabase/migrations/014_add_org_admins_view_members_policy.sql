-- Add RLS policy to allow owners/admins to view all members of their organizations
-- This fixes the issue where owners/admins couldn't see team members in the team management page

-- Drop existing policy if it exists (we'll recreate it)
DROP POLICY IF EXISTS "Users can view own memberships" ON organization_members;

-- Users can view their own memberships
CREATE POLICY "Users can view own memberships" 
  ON organization_members 
  FOR SELECT 
  TO authenticated 
  USING (profile_id = auth.uid());

-- Org owners/admins can view all members of their organizations
CREATE POLICY "Org admins can view all members" 
  ON organization_members 
  FOR SELECT 
  TO authenticated 
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );
