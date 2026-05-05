-- Coarse progress reporting for the onboarding scrape worker.
--
-- The Firecrawl /scrape call is synchronous (no streaming), and the Gemini
-- classification step is a single batched request — but the worker still
-- moves through several distinct stages that each take seconds. Surfacing
-- the current stage to the polling wizard turns "spinner for 60s" into
-- "Scanning your website → Identifying materials (12 images) → Finalizing".
--
-- Shape of `progress`:
--   { stage: 'scraping' | 'extracting' | 'classifying' | 'finalizing',
--     message: string,
--     total?: number }

ALTER TABLE org_onboarding_scrapes
  ADD COLUMN IF NOT EXISTS progress JSONB;
