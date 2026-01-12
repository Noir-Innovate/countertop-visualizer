-- Fix Organization RLS Policy
-- Add created_by column and update policies to allow users to view organizations they create

-- Add created_by column to track who created the organization
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by) WHERE created_by IS NOT NULL;

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Members can view their orgs" ON organizations;

-- Create updated SELECT policy that allows viewing:
-- 1. Organizations where user is a member
-- 2. Organizations created by the user (for immediate access after creation)
CREATE POLICY "Members can view their orgs" 
  ON organizations 
  FOR SELECT 
  TO authenticated 
  USING (
    id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid()
    )
    OR created_by = auth.uid()
  );

-- Update INSERT policy to set created_by automatically
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON organizations;

CREATE POLICY "Authenticated users can create orgs" 
  ON organizations 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (created_by = auth.uid());
