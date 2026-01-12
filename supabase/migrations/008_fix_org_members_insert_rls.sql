-- Restore the original "Org admins can insert members" policy
-- Since organization creation now uses the service role API endpoint,
-- we can use the simpler policy that only allows owners/admins to add members

-- Drop any existing INSERT policy
DROP POLICY IF EXISTS "Users can insert organization members" ON organization_members;
DROP POLICY IF EXISTS "Org admins can insert members" ON organization_members;

-- Restore the original policy: Org owners/admins can insert members
CREATE POLICY "Org admins can insert members" 
  ON organization_members 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

