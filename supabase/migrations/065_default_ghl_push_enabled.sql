-- Default GHL push to ON for every material line.
-- Lines without a configured GHL integration still skip safely (no_integration).

ALTER TABLE material_lines
  ALTER COLUMN ghl_push_enabled SET DEFAULT TRUE;

UPDATE material_lines
  SET ghl_push_enabled = TRUE
  WHERE ghl_push_enabled = FALSE;
