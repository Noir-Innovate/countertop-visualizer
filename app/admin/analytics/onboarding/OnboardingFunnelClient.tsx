"use client";

import { useEffect, useState } from "react";

interface Stage {
  key: string;
  label: string;
  users: number;
  convFromPrev: number;
  convFromFirst: number;
  medianSecondsToNext: number | null;
}

interface Action {
  key: string;
  label: string;
  users: number;
}

interface FunnelResponse {
  range: { from: string; to: string };
  stages: Stage[];
  actions: Action[];
}

const TIMEFRAMES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h${m ? ` ${m}m` : ""}`;
  }
  return `${Math.round(seconds / 86400)}d`;
}

export function OnboardingFunnelClient() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/analytics/onboarding-funnel?days=${days}`)
      .then(async (r) => {
        const body = await r.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(body.error ?? "Failed to load");
        setData(body);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  // Anchor bar widths to the largest stage so the biggest count fills the
  // row and the others scale visibly. Using the first stage as the anchor
  // collapses every bar to the minimum when stage 1 is 0 (which happens
  // anytime the entry event is e.g. anonymous page views).
  const maxUsers = data
    ? data.stages.reduce((m, s) => Math.max(m, s.users), 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.days}
            type="button"
            onClick={() => setDays(t.days)}
            className={`px-3 py-1.5 text-sm rounded-lg border ${
              days === t.days
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            Last {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-sm text-slate-500">Loading funnel…</div>
      )}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="space-y-4">
              {data.stages.map((stage, idx) => {
                const widthPct =
                  maxUsers > 0
                    ? Math.max(2, (stage.users / maxUsers) * 100)
                    : 2;
                return (
                  <div key={stage.key}>
                    <div className="flex items-baseline justify-between text-sm mb-1">
                      <span className="font-medium text-slate-900">
                        {idx + 1}. {stage.label}
                      </span>
                      <span className="text-slate-700 tabular-nums">
                        {stage.users.toLocaleString()} users
                      </span>
                    </div>
                    <div className="h-8 bg-slate-100 rounded-md overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                      <span>
                        {idx === 0
                          ? "Entry stage"
                          : `${stage.convFromPrev.toFixed(1)}% from prev · ${stage.convFromFirst.toFixed(1)}% overall`}
                      </span>
                      <span>
                        {idx < data.stages.length - 1
                          ? `median ${formatDuration(stage.medianSecondsToNext)} to next`
                          : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              Action events
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.actions.map((a) => (
                <div
                  key={a.key}
                  className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">{a.label}</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {a.users.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Range:{" "}
            {new Date(data.range.from).toLocaleDateString()} –{" "}
            {new Date(data.range.to).toLocaleDateString()}
          </p>
        </>
      )}
    </div>
  );
}
