-- Add sales_person role, phone field to profiles, and organization_invitations table
-- This migration adds support for team management and profile updates

-- ============================================
-- UPDATE ORGANIZATION_MEMBERS ROLE CONSTRAINT
-- ============================================
-- Drop the existing CHECK constraint
ALTER TABLE organization_members 
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

-- Add new CHECK constraint with sales_person role
ALTER TABLE organization_members 
  ADD CONSTRAINT organization_members_role_check 
  CHECK (role IN ('owner', 'admin', 'member', 'sales_person'));

-- ============================================
-- ADD PHONE COLUMN TO PROFILES
-- ============================================
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Create index for phone lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;

-- ============================================
-- ORGANIZATION INVITATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'sales_person')) DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_expires ON organization_invitations(expires_at) WHERE accepted_at IS NULL;

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR ORGANIZATION_INVITATIONS
-- ============================================
-- Service role can do everything
CREATE POLICY "Service role full access on organization_invitations" 
  ON organization_invitations 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Org owners/admins can view invitations for their orgs
CREATE POLICY "Org admins can view invitations" 
  ON organization_invitations 
  FOR SELECT 
  TO authenticated 
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Org owners/admins can create invitations
CREATE POLICY "Org admins can create invitations" 
  ON organization_invitations 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE profile_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
    AND invited_by = auth.uid()
  );

-- Anyone can read invitation by token (for accepting)
CREATE POLICY "Anyone can read invitation by token" 
  ON organization_invitations 
  FOR SELECT 
  TO anon, authenticated 
  USING (true);

-- Users can update invitations they created (to mark as accepted)
-- Also allow service role to update
CREATE POLICY "Invited user can accept invitation" 
  ON organization_invitations 
  FOR UPDATE 
  TO authenticated 
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND accepted_at IS NULL
    AND expires_at > NOW()
  )
  WITH CHECK (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND accepted_at IS NOT NULL
  );

-- ============================================
-- UPDATE RLS POLICIES TO INCLUDE SALES_PERSON ROLE
-- ============================================
-- Update material lines policies to include sales_person where appropriate
-- Note: Sales person should have similar permissions to member for viewing, but not creating/updating

-- The existing policies already use role IN ('owner', 'admin') for management,
-- so sales_person will have member-level access (view only) by default.
-- No changes needed to existing policies as they explicitly list roles.

