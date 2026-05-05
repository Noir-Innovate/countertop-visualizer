import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ensureReferralCodeForProfile, hasW9OnFile } from "@/lib/referrals";
import { ShareCodeBlock } from "@/components/referrals/ShareCodeBlock";
import { ReferralKPIs } from "@/components/referrals/ReferralKPIs";
import { ReferralsTable } from "@/components/referrals/ReferralsTable";
import { PayoutsTable } from "@/components/referrals/PayoutsTable";
import { W9Status } from "@/components/referrals/W9Status";
import { CommissionMRR } from "@/components/referrals/CommissionMRR";
import { PayoutProfileForm } from "@/components/referrals/PayoutProfileForm";

export default async function AffiliatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard/login");

  const { code } = await ensureReferralCodeForProfile(user.id);
  const w9OnFile = await hasW9OnFile(user.id);

  const service = await createServiceClient();
  const [{ data: referrals }, { data: payouts }, { data: balanceRow }] =
    await Promise.all([
      service
        .from("referrals")
        .select(
          "id, referee_organization_id, referee_email, status, activated_at, created_at, organizations:referee_organization_id(name)",
        )
        .eq("referrer_profile_id", user.id)
        .order("created_at", { ascending: false }),
      service
        .from("referral_payouts")
        .select("id, amount_cents, method, paid_at, note")
        .eq("referrer_profile_id", user.id)
        .order("paid_at", { ascending: false }),
      service
        .from("referral_balances")
        .select(
          "lifetime_accrued_cents, this_month_accrued_cents, lifetime_paid_cents, unpaid_balance_cents",
        )
        .eq("referrer_profile_id", user.id)
        .maybeSingle(),
    ]);

  const balance = balanceRow ?? {
    lifetime_accrued_cents: 0,
    this_month_accrued_cents: 0,
    lifetime_paid_cents: 0,
    unpaid_balance_cents: 0,
  };

  // Fetch the live billing status for every referee org in one shot — same
  // source the org's billing page reads, so the affiliate view never drifts.
  const refereeOrgIds = (referrals ?? [])
    .map((r) => r.referee_organization_id as string | null)
    .filter((id): id is string => Boolean(id));
  const billingByOrg = new Map<string, string | null>();
  if (refereeOrgIds.length > 0) {
    const { data: billingRows } = await service
      .from("organization_billing_accounts")
      .select("organization_id, internal_plan_status")
      .in("organization_id", refereeOrgIds);
    for (const row of billingRows ?? []) {
      billingByOrg.set(
        row.organization_id as string,
        (row.internal_plan_status as string | null) ?? null,
      );
    }
  }

  const referralRows = (referrals ?? []).map((r) => {
    const refOrg = r.organizations as
      | { name: string }
      | { name: string }[]
      | null;
    const refereeName = Array.isArray(refOrg) ? refOrg[0]?.name : refOrg?.name;
    const billingStatus = r.referee_organization_id
      ? billingByOrg.get(r.referee_organization_id as string) ?? null
      : null;
    return {
      id: r.id,
      refereeName: refereeName ?? r.referee_email ?? "Unknown",
      billingStatus,
      createdAt: r.created_at as string,
      activatedAt: r.activated_at as string | null,
    };
  });

  // "Active" for KPI purposes = anything Stripe considers a paying state.
  const activeCount = referralRows.filter((r) =>
    ["active", "trialing", "past_due"].includes(r.billingStatus ?? ""),
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Affiliate</h2>
        <p className="text-slate-600 mt-1 text-sm">
          Earn 40% of every paid month from contractors you refer.
        </p>
      </div>

      <ShareCodeBlock code={code} />
      <CommissionMRR />
      <ReferralKPIs
        referredCount={referralRows.length}
        activeCount={activeCount}
        thisMonthCents={Number(balance.this_month_accrued_cents)}
        lifetimeAccruedCents={Number(balance.lifetime_accrued_cents)}
        unpaidBalanceCents={Number(balance.unpaid_balance_cents)}
      />
      <W9Status onFile={w9OnFile} />
      <PayoutProfileForm />
      <ReferralsTable rows={referralRows} />
      <PayoutsTable
        rows={(payouts ?? []).map((p) => ({
          id: p.id,
          amountCents: p.amount_cents,
          method: p.method,
          paidAt: p.paid_at,
          note: p.note,
        }))}
      />
    </div>
  );
}
