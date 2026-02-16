-- Add UTM/attribution to analytics_events and allow any event_type for Supabase-backed tracking

-- Allow any event_type (drop the original CHECK)
ALTER TABLE analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;

-- Add attribution columns for segmenting by UTM
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '{}';

-- Indexes for segmenting queries by UTM
CREATE INDEX IF NOT EXISTS idx_analytics_events_utm_source ON analytics_events(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_utm_campaign ON analytics_events(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_utm_medium ON analytics_events(utm_medium) WHERE utm_medium IS NOT NULL;

COMMENT ON COLUMN analytics_events.utm_source IS 'Captured from URL at event time for segmenting';
COMMENT ON COLUMN analytics_events.tags IS 'Custom query params (e.g. source, ref) at event time';
