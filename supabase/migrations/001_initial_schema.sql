-- Countertop Visualizer Database Schema
-- Run this migration in Supabase SQL Editor

-- User sessions for phone verification
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on phone for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_phone ON user_sessions(phone);

-- Phone verification codes
CREATE TABLE IF NOT EXISTS phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone ON phone_verifications(phone);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_code ON phone_verifications(code);

-- Lead submissions
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  selected_slab_id TEXT,
  selected_image_url TEXT,
  ab_variant TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for leads
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_session_id ON leads(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_sessions
-- Allow service role full access
CREATE POLICY "Service role can do everything on user_sessions" 
  ON user_sessions 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Allow anon to read their own session by phone (for client-side checks)
CREATE POLICY "Users can read their own session" 
  ON user_sessions 
  FOR SELECT 
  TO anon 
  USING (true);

-- RLS Policies for phone_verifications
-- Only service role can manage verifications
CREATE POLICY "Service role can do everything on phone_verifications" 
  ON phone_verifications 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- RLS Policies for leads
-- Service role full access
CREATE POLICY "Service role can do everything on leads" 
  ON leads 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Allow anon to insert leads (for form submission)
CREATE POLICY "Anyone can submit leads" 
  ON leads 
  FOR INSERT 
  TO anon 
  WITH CHECK (true);

-- Function to clean up expired verification codes (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_verifications()
RETURNS void AS $$
BEGIN
  DELETE FROM phone_verifications 
  WHERE expires_at < NOW() AND verified = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create a scheduled job to clean up expired codes
-- This requires pg_cron extension which may need to be enabled in Supabase
-- SELECT cron.schedule('cleanup-expired-verifications', '0 * * * *', 'SELECT cleanup_expired_verifications();');


