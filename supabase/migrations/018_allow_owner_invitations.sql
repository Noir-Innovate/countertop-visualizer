-- Allow inviting users as owners
-- Update the organization_invitations table to allow 'owner' role

ALTER TABLE organization_invitations 
  DROP CONSTRAINT IF EXISTS organization_invitations_role_check;

ALTER TABLE organization_invitations 
  ADD CONSTRAINT organization_invitations_role_check 
  CHECK (role IN ('owner', 'admin', 'member', 'sales_person'));

