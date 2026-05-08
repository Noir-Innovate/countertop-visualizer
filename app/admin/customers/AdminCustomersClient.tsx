"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Customer {
  id: string;
  name: string;
  created_at: string;
  material_lines_external: number;
  material_lines_internal: number;
  member_count: number;
  plan_status: string | null;
  plan_subscription_id: string | null;
  plan_current_period_end: string | null;
  plan_cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  leads_in_period: number;
  leads_total: number;
  generations_in_period: number;
  last_lead_at: string | null;
}

type SortKey =
  | "name"
  | "created_at"
  | "material_lines_external"
  | "material_lines_internal"
  | "member_count"
  | "plan_status"
  | "leads_in_period"
  | "leads_total"
  | "generations_in_period"
  | "last_lead_at";

const PLAN_PILL: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  trialing: "bg-blue-100 text-blue-800",
  past_due: "bg-amber-100 text-amber-800",
  canceled: "bg-slate-200 text-slate-700",
  inactive: "bg-slate-100 text-slate-600",
};

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

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminCustomersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const days = Number(searchParams.get("days") ?? 30);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("leads_in_period");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/admin/customers?days=${days}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setCustomers(d.customers ?? []))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [days]);

  const onDaysChange = useCallback(
    (d: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("days", String(d));
      router.push(`/admin/customers?${params.toString()}`);
    },
    [router, searchParams],
  );

  const onSort = useCallback(
    (k: SortKey) => {
      if (k === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(k);
        setSortDir(
          k === "name" || k === "plan_status" ? "asc" : "desc",
        );
      }
    },
    [sortKey],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? customers.filter((c) => c.name.toLowerCase().includes(q))
      : customers.slice();
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
  }, [customers, search, sortKey, sortDir]);

  const totalActive = customers.filter(
    (c) => c.plan_status === "active" || c.plan_status === "trialing",
  ).length;
  const totalLeads = customers.reduce((s, c) => s + c.leads_in_period, 0);
  const totalGens = customers.reduce(
    (s, c) => s + c.generations_in_period,
    0,
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">
            All organizations with usage and plan info.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
                days === d
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Organizations" value={customers.length} />
        <SummaryCard label="Active / Trialing" value={totalActive} />
        <SummaryCard label={`Leads (${days}d)`} value={totalLeads} />
        <SummaryCard label={`Generations (${days}d)`} value={totalGens} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {visible.length} of {customers.length} organizations
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

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wide bg-slate-50">
                  <Th label="Company" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Plan" k="plan_status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="External lines" k="material_lines_external" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Internal lines" k="material_lines_internal" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Members" k="member_count" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label={`Leads (${days}d)`} k="leads_in_period" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Leads (all)" k="leads_total" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label={`Gens (${days}d)`} k="generations_in_period" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Last lead" k="last_lead_at" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Created" k="created_at" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className="px-4 py-2 font-medium">Stripe</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900 font-medium">
                      <Link
                        href={`/admin/analytics?organizationId=${c.id}&days=${days}`}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <PlanPill
                        status={c.plan_status}
                        cancelAtPeriodEnd={c.plan_cancel_at_period_end}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{c.material_lines_external}</td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{c.material_lines_internal}</td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{c.member_count}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium tabular-nums">{c.leads_in_period}</td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{c.leads_total}</td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{c.generations_in_period}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(c.last_lead_at)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.stripe_customer_id ? (
                        <a
                          href={`https://dashboard.stripe.com/customers/${c.stripe_customer_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          open
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
        {value.toLocaleString()}
      </div>
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
