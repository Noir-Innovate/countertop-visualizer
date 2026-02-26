-- Set default per-lead billing to $50.00 for all organizations

-- Backfill: ensure every existing organization has at least one pricing row
INSERT INTO organization_billing_pricing (
  organization_id,
  lead_price_cents,
  effective_at,
  created_by
)
SELECT
  o.id,
  5000,
  NOW(),
  NULL
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_billing_pricing p
  WHERE p.organization_id = o.id
);

-- Future-proof: auto-create default pricing row for new organizations
CREATE OR REPLACE FUNCTION ensure_default_org_lead_price()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM organization_billing_pricing p
    WHERE p.organization_id = NEW.id
  ) THEN
    INSERT INTO organization_billing_pricing (
      organization_id,
      lead_price_cents,
      effective_at,
      created_by
    )
    VALUES (
      NEW.id,
      5000,
      NOW(),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_default_org_lead_price_trigger ON organizations;
CREATE TRIGGER set_default_org_lead_price_trigger
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION ensure_default_org_lead_price();
