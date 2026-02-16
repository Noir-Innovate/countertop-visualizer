-- Add super_admin flag to profiles for global admin access (e.g. /admin/analytics).
-- Only service_role or direct SQL can set this; no RLS policy allows users to set it.
-- To grant super admin: UPDATE profiles SET is_super_admin = true WHERE id = '<auth_user_uuid>';
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_super_admin ON profiles(is_super_admin) WHERE is_super_admin = true;

COMMENT ON COLUMN profiles.is_super_admin IS 'When true, user can access /admin/* and see all analytics across organizations. Set via SQL or service role only.';
