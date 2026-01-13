-- Add email column to profiles table and sync with auth.users
-- This migration adds email to profiles, updates the auto-create function,
-- and creates a trigger to sync email changes from auth.users

-- ============================================
-- ADD EMAIL COLUMN TO PROFILES
-- ============================================
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;

-- ============================================
-- BACKFILL EXISTING PROFILES WITH EMAIL
-- ============================================
UPDATE profiles
SET email = (
  SELECT email 
  FROM auth.users 
  WHERE auth.users.id = profiles.id
)
WHERE email IS NULL;

-- ============================================
-- UPDATE handle_new_user() FUNCTION
-- ============================================
-- Function to create profile on signup (now includes email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CREATE FUNCTION TO SYNC EMAIL CHANGES
-- ============================================
-- Function to update profile email when auth.users.email changes
CREATE OR REPLACE FUNCTION public.handle_user_email_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if email actually changed
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE public.profiles
    SET email = NEW.email,
        updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CREATE TRIGGER FOR EMAIL UPDATES
-- ============================================
-- Drop trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;

-- Create trigger on auth.users update
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW 
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_user_email_update();

