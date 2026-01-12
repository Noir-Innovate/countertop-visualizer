-- Update analytics_events table to allow nullable material_line_id and organization_id
-- This allows tracking events even without material line or organization context

-- Make material_line_id nullable
ALTER TABLE analytics_events
  ALTER COLUMN material_line_id DROP NOT NULL;

-- Make organization_id nullable
ALTER TABLE analytics_events
  ALTER COLUMN organization_id DROP NOT NULL;

-- Update foreign key constraints to allow NULL values
-- Drop existing foreign key constraints if they exist (they should allow NULL anyway, but ensure it)
-- Note: Foreign keys in PostgreSQL already allow NULL by default, so we just need to ensure the columns are nullable

-- Update indexes to handle NULL values (existing indexes should work fine with NULLs)
-- No changes needed for indexes as they already handle NULL values

-- RLS policies should already allow inserts without material_line_id/org_id
-- The existing policy "Anyone can insert analytics" should work fine


