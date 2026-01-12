-- Add SMS notifications field to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS sms_notifications BOOLEAN DEFAULT FALSE;

