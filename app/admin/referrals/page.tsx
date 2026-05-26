import { createServiceClient } from "@/lib/supabase/server";
import { PayoutForm } from "./PayoutForm";
import { StripeAdminActions } from "./StripeAdminActions";

export default async function AdminReferralsPage() {
  const service = await createServiceClient();
  const { data: balances } = await service
    .from("referral_balances")
    .select(
      "referrer_profile_id, lifetime_accrued_cents, this_month_accrued_cents, lifetime_paid_cents, unpaid_balance_cents",
    )
    .order("unpaid_balance_cents", { ascending: false });

  const profileIds = (balances ?? [])
    .map((b) => b.referrer_profile_id)
    .filter((id): id is string => Boolean(id));

  const profilesById: Record<
    string,
    { name: string; email: string | null }
  > = {};
  const stripeByProfile: Record<
    string,
    { accountId: string | null; payoutsEnabled: boolean; status: string | null }
  > = {};

  if (profileIds.length > 0) {
    const [{ data: profiles }, { data: payoutProfiles }] = await Promise.all([
      service
        .from("profiles")
        .select("id, full_name, email")
        .in("id", profileIds),
      service
        .from("referrer_payout_profiles")
        .select(
          "profile_id, stripe_account_id, stripe_payouts_enabled, stripe_account_status",
        )
        .in("profile_id", profileIds),
    ]);
    for (const p of profiles ?? []) {
      profilesById[p.id] = {
        name: p.full_name?.trim() || p.email?.trim() || "(unknown)",
        email: p.email ?? null,
      };
    }
    for (const pp of payoutProfiles ?? []) {
      stripeByProfile[pp.profile_id] = {
        accountId: pp.stripe_account_id ?? null,
        payoutsEnabled: Boolean(pp.stripe_payouts_enabled),
        status: (pp.stripe_account_status as string | null) ?? null,
      };
    }
  }

  const rows = (balances ?? []).map((b) => {
    const id = b.referrer_profile_id as string;
    const profile = profilesById[id];
    const stripe = stripeByProfile[id];
    return {
      profileId: id,
      name: profile?.name ?? "(unknown)",
      email: profile?.email ?? null,
      stripeAccountId: stripe?.accountId ?? null,
      stripePayoutsEnabled: stripe?.payoutsEnabled ?? false,
      stripeStatus: stripe?.status ?? null,
      lifetimeAccruedCents: Number(b.lifetime_accrued_cents),
      thisMonthCents: Number(b.this_month_accrued_cents),
      lifetimePaidCents: Number(b.lifetime_paid_cents),
      unpaidBalanceCents: Number(b.unpaid_balance_cents),
    };
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Referral payouts
      </h1>
      <p className="text-slate-600 text-sm mb-6">
        Referrers with unpaid balances first. Payouts go through Stripe Connect
        — affiliates must complete Stripe-hosted onboarding before they can be
        paid. Stripe issues 1099-NECs at year-end.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs uppercase tracking-wide bg-slate-50">
              <th className="px-6 py-3 font-medium">Referrer</th>
              <th className="px-6 py-3 font-medium">Stripe payouts</th>
              <th className="px-6 py-3 font-medium">This month</th>
              <th className="px-6 py-3 font-medium">Lifetime accrued</th>
              <th className="px-6 py-3 font-medium">Paid out</th>
              <th className="px-6 py-3 font-medium">Unpaid</th>
              <th className="px-6 py-3 font-medium">Record payout</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-8 text-center text-slate-500"
                >
                  No referral activity yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.profileId} className="border-t border-slate-100">
                  <td className="px-6 py-3 text-slate-900">
                    <div>{r.name}</div>
                    {r.email && (
                      <div className="text-xs text-slate-500">{r.email}</div>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {r.stripePayoutsEnabled ? (
                      <span className="text-xs text-emerald-700">Active</span>
                    ) : r.stripeAccountId ? (
                      <span className="text-xs text-amber-700">
                        Onboarding incomplete
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">
                        Not started
                      </span>
                    )}
                    <StripeAdminActions
                      profileId={r.profileId}
                      stripeAccountId={r.stripeAccountId}
                    />
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {usd(r.thisMonthCents)}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {usd(r.lifetimeAccruedCents)}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {usd(r.lifetimePaidCents)}
                  </td>
                  <td
                    className={`px-6 py-3 font-medium ${
                      r.unpaidBalanceCents > 0
                        ? "text-emerald-600"
                        : "text-slate-400"
                    }`}
                  >
                    {usd(r.unpaidBalanceCents)}
                  </td>
                  <td className="px-6 py-3">
                    <PayoutForm
                      profileId={r.profileId}
                      defaultAmountCents={r.unpaidBalanceCents}
                      stripePayoutsEnabled={r.stripePayoutsEnabled}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
