-- App prompt versions: immutable prompt versions (no direct edit; create new version to change).
-- takeoff_generations: record which prompt version was used for each takeoff for quality tracking.

-- ============================================
-- APP_PROMPT_VERSIONS
-- One row per version; latest version per key is used. No UPDATE - only INSERT new rows.
-- ============================================
CREATE TABLE IF NOT EXISTS app_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key, version)
);

COMMENT ON TABLE app_prompt_versions IS 'Immutable prompt versions; add new row to change prompt. No updates.';

CREATE INDEX IF NOT EXISTS idx_app_prompt_versions_key_version ON app_prompt_versions(key, version DESC);

ALTER TABLE app_prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on app_prompt_versions"
  ON app_prompt_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Prevent updates (prompts are immutable; create new version instead)
-- We allow ALL for service_role so they can still manage via SQL if needed; app code should only INSERT and SELECT.
-- To enforce no updates at app level we could use a trigger; for now we document and use only INSERT in code.

-- Migrate existing app_prompts into version 1
INSERT INTO app_prompt_versions (key, version, content)
SELECT key, 1, content FROM app_prompts
ON CONFLICT (key, version) DO NOTHING;

-- ============================================
-- TAKEOFF_GENERATIONS
-- Records which prompt version was used for each takeoff (for quality tracking).
-- ============================================
CREATE TABLE IF NOT EXISTS takeoff_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_prompt_version_id UUID NOT NULL REFERENCES app_prompt_versions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE takeoff_generations IS 'Tracks which prompt version was used for each takeoff for output quality analysis.';

CREATE INDEX IF NOT EXISTS idx_takeoff_generations_prompt_version ON takeoff_generations(app_prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_generations_created_at ON takeoff_generations(created_at DESC);

ALTER TABLE takeoff_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on takeoff_generations"
  ON takeoff_generations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================
-- DROP OLD TABLE
-- ============================================
DROP TABLE IF EXISTS app_prompts;
