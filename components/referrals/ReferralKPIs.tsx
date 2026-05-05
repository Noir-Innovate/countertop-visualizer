interface Props {
  referredCount: number;
  activeCount: number;
  thisMonthCents: number;
  lifetimeAccruedCents: number;
  unpaidBalanceCents: number;
}

export function ReferralKPIs({
  referredCount,
  activeCount,
  thisMonthCents,
  lifetimeAccruedCents,
  unpaidBalanceCents,
}: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Kpi label="Referred" value={referredCount.toString()} />
      <Kpi label="Paying" value={activeCount.toString()} />
      <Kpi label="This month" value={formatUsd(thisMonthCents)} />
      <Kpi label="Lifetime accrued" value={formatUsd(lifetimeAccruedCents)} />
      <Kpi
        label="Unpaid balance"
        value={formatUsd(unpaidBalanceCents)}
        emphasis={unpaidBalanceCents > 0}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </p>
      <p
        className={`text-2xl font-bold ${
          emphasis ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
