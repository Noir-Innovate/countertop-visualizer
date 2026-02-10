-- Add lead attribution columns for UTM, referrer, and custom tags
-- Enables tracking where leads come from (sources, ads, campaigns)

-- ============================================
-- ADD UTM AND REFERRER COLUMNS TO LEADS
-- ============================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT;

-- ============================================
-- ADD TAGS JSONB FOR CUSTOM KEY-VALUE
-- ============================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '{}';

-- ============================================
-- INDEXES FOR FILTERING BY SOURCE/CAMPAIGN
-- ============================================
CREATE INDEX IF NOT EXISTS idx_leads_utm_source ON leads(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
