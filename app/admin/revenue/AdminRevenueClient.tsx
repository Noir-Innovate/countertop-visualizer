"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface RevenueCustomer {
  id: string;
  name: string;
  plan_status: string | null;
  plan_cancel_at_period_end: boolean;
  subscribed: boolean;
  price_per_lead_cents: number;
  leads_this_month: number;
  lead_revenue_cents: number;
  subscription_revenue_cents: number;
  total_revenue_cents: number;
}

interface RevenueTotals {
  lead_revenue_cents: number;
  subscription_revenue_cents: number;
  total_revenue_cents: number;
  leads_this_month: number;
  subscribed_count: number;
}

interface RevenueResponse {
  month_start: string;
  subscription_price_cents: number;
  customers: RevenueCustomer[];
  totals: RevenueTotals;
}

type SortKey =
  | "name"
  | "plan_status"
  | "leads_this_month"
  | "price_per_lead_cents"
  | "lead_revenue_cents"
  | "subscription_revenue_cents"
  | "total_revenue_cents";

const PLAN_PILL: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  trialing: "bg-blue-100 text-blue-800",
  past_due: "bg-amber-100 text-amber-800",
  canceled: "bg-slate-200 text-slate-700",
  inactive: "bg-slate-100 text-slate-600",
};

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function PlanPill({
  status,
  cancelAtPeriodEnd,
}: {
  status: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const label = status ?? "—";
  const cls = PLAN_PILL[label] ?? "bg-slate-100 text-slate-600";
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${cls}`}
      >
        {label}
      </span>
      {cancelAtPeriodEnd && (
        <span className="text-[10px] text-amber-700">cancels</span>
      )}
    </span>
  );
}

export default function AdminRevenueClient() {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_revenue_cents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/admin/revenue`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: RevenueResponse) => setData(d))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const onSort = useCallback(
    (k: SortKey) => {
      if (k === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(k);
        setSortDir(k === "name" || k === "plan_status" ? "asc" : "desc");
      }
    },
    [sortKey],
  );

  const visible = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? data.customers.filter((c) => c.name.toLowerCase().includes(q))
      : data.customers.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return filtered;
  }, [data, search, sortKey, sortDir]);

  const monthLabel = useMemo(() => {
    if (!data) return "";
    const d = new Date(data.month_start);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  }, [data]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Revenue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Projected revenue for {monthLabel || "the current month"}. Lead
            revenue is the sum of billable usage so far this month;
            subscription revenue counts active and trialing organizations at
            the standard monthly price
            {data
              ? ` (${formatUsd(data.subscription_price_cents)}/mo)`
              : ""}
            .
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <RevenueCard
          label="Leads revenue (MTD)"
          value={data ? formatUsd(data.totals.lead_revenue_cents) : "—"}
          sub={
            data
              ? `${data.totals.leads_this_month.toLocaleString()} billable leads`
              : undefined
          }
          accent="bg-blue-50 border-blue-100 text-blue-900"
        />
        <RevenueCard
          label="Subscriptions revenue"
          value={
            data ? formatUsd(data.totals.subscription_revenue_cents) : "—"
          }
          sub={
            data
              ? `${data.totals.subscribed_count.toLocaleString()} active / trialing`
              : undefined
          }
          accent="bg-emerald-50 border-emerald-100 text-emerald-900"
        />
        <RevenueCard
          label="Total projected"
          value={data ? formatUsd(data.totals.total_revenue_cents) : "—"}
          sub={monthLabel ? `for ${monthLabel}` : undefined}
          accent="bg-slate-900 border-slate-900 text-white"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {visible.length} of {data?.customers.length ?? 0} organizations
            </h2>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name…"
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg w-64"
          />
        </div>

        {error && (
          <div className="p-6 text-sm text-red-600">Error: {error}</div>
        )}
        {loading && !error && (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        )}

        {!loading && !error && data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wide bg-slate-50">
                  <Th label="Company" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Plan" k="plan_status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Leads (MTD)" k="leads_this_month" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Price / lead" k="price_per_lead_cents" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Leads $ (MTD)" k="lead_revenue_cents" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Subscription $" k="subscription_revenue_cents" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Total $" k="total_revenue_cents" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 text-slate-900 font-medium">
                      {c.name}
                    </td>
                    <td className="px-4 py-3">
                      <PlanPill
                        status={c.plan_status}
                        cancelAtPeriodEnd={c.plan_cancel_at_period_end}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">
                      {c.leads_this_month.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">
                      {formatUsd(c.price_per_lead_cents)}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium tabular-nums">
                      {formatUsd(c.lead_revenue_cents)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">
                      {c.subscribed ? (
                        formatUsd(c.subscription_revenue_cents)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-semibold tabular-nums">
                      {formatUsd(c.total_revenue_cents)}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No organizations match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RevenueCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border shadow-sm p-5 ${accent}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-3xl font-bold mt-2 tabular-nums">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-80">{sub}</div>}
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = k === sortKey;
  return (
    <th className="px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-900 ${
          active ? "text-slate-900" : ""
        }`}
      >
        {label}
        {active && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
