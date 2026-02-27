-- Distinguish invoice creation from successful charge for lead usage billing.
ALTER TABLE organization_billing_usage
  ADD COLUMN IF NOT EXISTS stripe_invoice_status TEXT,
  ADD COLUMN IF NOT EXISTS stripe_invoice_paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_billing_usage_invoice_status
  ON organization_billing_usage(organization_id, stripe_invoice_status);
