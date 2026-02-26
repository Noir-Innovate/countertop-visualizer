-- Backfill billing usage ledger from historical leads that were not tracked yet.
-- This ensures billing summary reflects older leads as soon as billing is enabled.

INSERT INTO organization_billing_usage (
  organization_id,
  lead_id,
  material_line_id,
  lead_price_cents,
  billed_amount_cents,
  occurred_at
)
SELECT
  l.organization_id,
  l.id AS lead_id,
  l.material_line_id,
  COALESCE(p.lead_price_cents, 5000) AS lead_price_cents,
  COALESCE(p.lead_price_cents, 5000) AS billed_amount_cents,
  COALESCE(l.created_at, NOW()) AS occurred_at
FROM leads l
LEFT JOIN LATERAL (
  SELECT lead_price_cents
  FROM organization_billing_pricing p
  WHERE p.organization_id = l.organization_id
    AND p.effective_at <= COALESCE(l.created_at, NOW())
  ORDER BY p.effective_at DESC
  LIMIT 1
) p ON true
WHERE l.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM organization_billing_usage u
    WHERE u.lead_id = l.id
  );
