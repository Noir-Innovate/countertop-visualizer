-- Per-referrer-org rollup of accrued commissions vs paid out. Used by the
-- referrer dashboard and admin payout queue. security_invoker=true so the
-- underlying RLS policies on commissions/payouts are honored.

CREATE OR REPLACE VIEW referral_balances
WITH (security_invoker = true) AS
WITH accrued AS (
  SELECT
    referrer_organization_id,
    COALESCE(SUM(commission_amount_cents), 0)::BIGINT AS lifetime_accrued_cents,
    COALESCE(SUM(
      CASE
        WHEN accrued_at >= date_trunc('month', NOW())
        THEN commission_amount_cents
        ELSE 0
      END
    ), 0)::BIGINT AS this_month_accrued_cents
  FROM referral_commissions
  GROUP BY referrer_organization_id
),
paid AS (
  SELECT
    referrer_organization_id,
    COALESCE(SUM(amount_cents), 0)::BIGINT AS lifetime_paid_cents
  FROM referral_payouts
  GROUP BY referrer_organization_id
)
SELECT
  COALESCE(a.referrer_organization_id, p.referrer_organization_id) AS referrer_organization_id,
  COALESCE(a.lifetime_accrued_cents, 0) AS lifetime_accrued_cents,
  COALESCE(a.this_month_accrued_cents, 0) AS this_month_accrued_cents,
  COALESCE(p.lifetime_paid_cents, 0) AS lifetime_paid_cents,
  GREATEST(
    COALESCE(a.lifetime_accrued_cents, 0) - COALESCE(p.lifetime_paid_cents, 0),
    0
  ) AS unpaid_balance_cents
FROM accrued a
FULL OUTER JOIN paid p
  ON a.referrer_organization_id = p.referrer_organization_id;
