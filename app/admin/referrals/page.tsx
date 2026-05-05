import { createServiceClient } from "@/lib/supabase/server";
import { PayoutForm } from "./PayoutForm";

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
  const w9ByProfile: Record<string, boolean> = {};
  const paypalByProfile: Record<string, string | null> = {};

  if (profileIds.length > 0) {
    const [{ data: profiles }, { data: payoutProfiles }] = await Promise.all([
      service
        .from("profiles")
        .select("id, full_name, email")
        .in("id", profileIds),
      service
        .from("referrer_payout_profiles")
        .select("profile_id, w9_collected_at, payout_method, payout_handle")
        .in("profile_id", profileIds),
    ]);
    for (const p of profiles ?? []) {
      profilesById[p.id] = {
        name: p.full_name?.trim() || p.email?.trim() || "(unknown)",
        email: p.email ?? null,
      };
    }
    for (const pp of payoutProfiles ?? []) {
      w9ByProfile[pp.profile_id] = Boolean(pp.w9_collected_at);
      paypalByProfile[pp.profile_id] =
        pp.payout_method === "paypal" ? pp.payout_handle ?? null : null;
    }
  }

  const rows = (balances ?? []).map((b) => {
    const id = b.referrer_profile_id as string;
    const profile = profilesById[id];
    return {
      profileId: id,
      name: profile?.name ?? "(unknown)",
      email: profile?.email ?? null,
      w9OnFile: w9ByProfile[id] ?? false,
      paypalEmail: paypalByProfile[id] ?? null,
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
        Referrers with unpaid balances first. W9 must be on file before
        recording a payout.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs uppercase tracking-wide bg-slate-50">
              <th className="px-6 py-3 font-medium">Referrer</th>
              <th className="px-6 py-3 font-medium">W9</th>
              <th className="px-6 py-3 font-medium">PayPal</th>
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
                  colSpan={8}
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
                    {r.w9OnFile ? (
                      <span className="text-xs text-emerald-700">On file</span>
                    ) : (
                      <span className="text-xs text-amber-700">Missing</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {r.paypalEmail ? (
                      <span className="text-xs text-slate-700 font-mono">
                        {r.paypalEmail}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">Missing</span>
                    )}
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
                      w9OnFile={r.w9OnFile}
                      paypalEmail={r.paypalEmail}
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
