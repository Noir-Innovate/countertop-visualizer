-- Add Email Settings Migration
-- This migration adds email sender name and reply-to fields at organization and material line levels

-- ============================================
-- ORGANIZATIONS TABLE - Add email settings
-- ============================================
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS email_reply_to TEXT;

-- ============================================
-- MATERIAL LINES TABLE - Add email settings (overrides org defaults)
-- ============================================
ALTER TABLE material_lines
  ADD COLUMN IF NOT EXISTS email_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS email_reply_to TEXT;
