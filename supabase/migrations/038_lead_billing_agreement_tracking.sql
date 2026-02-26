-- Track lead-billing agreement/payment setup state at org billing-account level
ALTER TABLE organization_billing_accounts
  ADD COLUMN IF NOT EXISTS lead_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_terms_accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_method_added_at TIMESTAMPTZ;
