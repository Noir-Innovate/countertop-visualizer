-- Update user_sessions table for visualization sessions
-- This migration adds fields needed for visualization session tracking

-- Add new columns to user_sessions
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS client_session_id TEXT,
  ADD COLUMN IF NOT EXISTS kitchen_image_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Make phone nullable to support visualization sessions without phone verification
ALTER TABLE user_sessions
  ALTER COLUMN phone DROP NOT NULL;

-- Create index on client_session_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_client_session_id 
  ON user_sessions(client_session_id) 
  WHERE client_session_id IS NOT NULL;

-- Create unique index on client_session_id to ensure one session per client_session_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_client_session_id_unique 
  ON user_sessions(client_session_id) 
  WHERE client_session_id IS NOT NULL;

-- Update RLS policies to allow anonymous users to insert/read/update their own sessions
-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can read their own session" ON user_sessions;
DROP POLICY IF EXISTS "Anonymous can insert visualization sessions" ON user_sessions;
DROP POLICY IF EXISTS "Anonymous can read sessions by client_session_id" ON user_sessions;
DROP POLICY IF EXISTS "Anonymous can update sessions by client_session_id" ON user_sessions;

-- Allow anon to insert sessions (for visualization sessions)
CREATE POLICY "Anonymous can insert visualization sessions" 
  ON user_sessions 
  FOR INSERT 
  TO anon 
  WITH CHECK (true);

-- Allow anon to read sessions (for loading visualization sessions)
CREATE POLICY "Anonymous can read sessions" 
  ON user_sessions 
  FOR SELECT 
  TO anon 
  USING (true);

-- Allow anon to update their own sessions
CREATE POLICY "Anonymous can update sessions" 
  ON user_sessions 
  FOR UPDATE 
  TO anon 
  USING (true)
  WITH CHECK (true);

-- Create trigger to update updated_at on row updates
CREATE OR REPLACE FUNCTION update_user_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_sessions_updated_at_trigger ON user_sessions;
CREATE TRIGGER update_user_sessions_updated_at_trigger
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_sessions_updated_at();


