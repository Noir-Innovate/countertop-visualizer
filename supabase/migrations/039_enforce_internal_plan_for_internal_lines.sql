-- Require an active internal-line subscription whenever an internal line is created
-- (or when a line is switched to internal by privileged users).

CREATE OR REPLACE FUNCTION enforce_internal_line_plan_requirement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.line_kind = 'internal' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM organization_billing_accounts oba
      WHERE oba.organization_id = NEW.organization_id
        AND oba.internal_plan_status IN ('active', 'trialing', 'past_due')
    ) THEN
      RAISE EXCEPTION 'Organization must have an active internal plan before creating or converting to an internal line';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_lines_require_internal_plan_trigger ON material_lines;
CREATE TRIGGER material_lines_require_internal_plan_trigger
  BEFORE INSERT OR UPDATE OF line_kind ON material_lines
  FOR EACH ROW
  EXECUTE FUNCTION enforce_internal_line_plan_requirement();
