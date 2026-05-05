interface Row {
  id: string;
  amountCents: number;
  method: string;
  paidAt: string;
  note: string | null;
}

interface Props {
  rows: Row[];
}

export function PayoutsTable({ rows }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Payouts</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Payouts are sent manually by our team. Reach out if anything looks off.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">No payouts yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-6 py-2 font-medium">Date</th>
              <th className="px-6 py-2 font-medium">Amount</th>
              <th className="px-6 py-2 font-medium">Method</th>
              <th className="px-6 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-6 py-3 text-slate-600">
                  {new Date(r.paidAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-6 py-3 text-slate-900 font-medium">
                  ${(r.amountCents / 100).toFixed(2)}
                </td>
                <td className="px-6 py-3 text-slate-600 capitalize">
                  {r.method}
                </td>
                <td className="px-6 py-3 text-slate-600">{r.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
