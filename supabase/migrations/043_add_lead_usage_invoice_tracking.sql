-- Track Stripe invoicing state for usage-based lead billing rows
ALTER TABLE organization_billing_usage
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_period_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_billing_usage_invoiced_at
  ON organization_billing_usage(organization_id, invoiced_at);

CREATE INDEX IF NOT EXISTS idx_org_billing_usage_invoice_id
  ON organization_billing_usage(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
