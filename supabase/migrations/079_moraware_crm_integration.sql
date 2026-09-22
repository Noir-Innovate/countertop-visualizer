-- Moraware as a second CRM integration provider — per organization, like GHL.
-- Reuses crm_integrations: api_token holds the encrypted secret for both
-- providers (GHL private token / Moraware password), so Moraware creds are
-- encrypted at rest exactly like GHL's and never exposed after saving.
--
-- Moraware also needs a tenant prefix (e.g. "asf") and a username, which GHL
-- doesn't — added as nullable columns. location_id is GHL-only, so it becomes
-- nullable. (Numbered 079 to sit past the outbound PR's 074-078 and avoid a
-- migration-number collision.)

ALTER TABLE crm_integrations
  DROP CONSTRAINT IF EXISTS crm_integrations_provider_check;
ALTER TABLE crm_integrations
  ADD CONSTRAINT crm_integrations_provider_check
  CHECK (provider IN ('ghl', 'moraware'));

ALTER TABLE crm_integrations ALTER COLUMN location_id DROP NOT NULL;

ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS tenant TEXT;
ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS username TEXT;

COMMENT ON COLUMN crm_integrations.tenant IS
  'Moraware tenant/subdomain prefix (e.g. "asf" for asf.moraware.net). GHL rows leave it null.';
COMMENT ON COLUMN crm_integrations.username IS
  'Moraware login user. GHL rows leave it null. The password lives encrypted in api_token.';
