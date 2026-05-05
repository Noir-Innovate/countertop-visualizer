interface Row {
  id: string;
  refereeName: string;
  // Live status from the referee org's billing account
  // (organization_billing_accounts.internal_plan_status). Null if the org
  // hasn't reached billing yet.
  billingStatus: string | null;
  createdAt: string;
  activatedAt: string | null;
}

interface Props {
  rows: Row[];
}

export function ReferralsTable({ rows }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Your referrals</h2>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">
          No referrals yet. Share your code to invite contractors.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-6 py-2 font-medium">Organization</th>
              <th className="px-6 py-2 font-medium">Billing status</th>
              <th className="px-6 py-2 font-medium">Signed up</th>
              <th className="px-6 py-2 font-medium">Activated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-6 py-3 text-slate-900">{r.refereeName}</td>
                <td className="px-6 py-3">
                  <BillingStatusPill status={r.billingStatus} />
                </td>
                <td className="px-6 py-3 text-slate-600">
                  {formatDate(r.createdAt)}
                </td>
                <td className="px-6 py-3 text-slate-600">
                  {r.activatedAt ? formatDate(r.activatedAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BillingStatusPill({ status }: { status: string | null }) {
  // Map Stripe-side statuses to colors + friendly labels. Falls back to
  // "no billing yet" if the referee hasn't started a subscription.
  const meta: { label: string; className: string } = (() => {
    switch (status) {
      case "active":
        return {
          label: "active",
          className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "trialing":
        return {
          label: "trialing",
          className: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "past_due":
        return {
          label: "past due",
          className: "bg-amber-50 text-amber-700 border-amber-200",
        };
      case "canceled":
      case "cancelled":
        return {
          label: "canceled",
          className: "bg-slate-100 text-slate-600 border-slate-200",
        };
      case "incomplete":
      case "incomplete_expired":
        return {
          label: "incomplete",
          className: "bg-rose-50 text-rose-700 border-rose-200",
        };
      case "unpaid":
        return {
          label: "unpaid",
          className: "bg-rose-50 text-rose-700 border-rose-200",
        };
      case "paused":
        return {
          label: "paused",
          className: "bg-slate-100 text-slate-600 border-slate-200",
        };
      case null:
      case undefined:
        return {
          label: "no billing yet",
          className: "bg-slate-50 text-slate-500 border-slate-200",
        };
      default:
        return {
          label: status,
          className: "bg-slate-100 text-slate-700 border-slate-200",
        };
    }
  })();
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium border rounded-full ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
