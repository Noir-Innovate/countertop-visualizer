-- Create material_line_notifications table
-- This table stores which users should receive notifications for new leads on a material line

-- ============================================
-- MATERIAL LINE NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS material_line_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_line_id UUID NOT NULL REFERENCES material_lines(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(material_line_id, profile_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_material_line_notifications_material_line ON material_line_notifications(material_line_id);
CREATE INDEX IF NOT EXISTS idx_material_line_notifications_profile ON material_line_notifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_material_line_notifications_sms ON material_line_notifications(sms_enabled) WHERE sms_enabled = true;
CREATE INDEX IF NOT EXISTS idx_material_line_notifications_email ON material_line_notifications(email_enabled) WHERE email_enabled = true;

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE material_line_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR MATERIAL_LINE_NOTIFICATIONS
-- ============================================

-- Users can view their own notification assignments
CREATE POLICY "Users can view own notification assignments" 
  ON material_line_notifications 
  FOR SELECT 
  TO authenticated 
  USING (profile_id = auth.uid());

