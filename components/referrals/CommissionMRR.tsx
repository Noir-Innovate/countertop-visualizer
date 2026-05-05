"use client";

import { useEffect, useState } from "react";

interface MRR {
  grossMrrCents: number;
  commissionMrrCents: number;
  activeReferees: number;
}

export function CommissionMRR() {
  const [data, setData] = useState<MRR | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/referrals/mrr")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Failed to load MRR");
        return body as MRR;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
        Recurring commission
      </p>
      {loading ? (
        <p className="text-2xl font-bold text-slate-400">…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data ? (
        <>
          <p className="text-3xl font-bold text-emerald-600">
            ${(data.commissionMrrCents / 100).toFixed(2)}
            <span className="text-base font-medium text-slate-500">/mo</span>
          </p>
          <p className="text-sm text-slate-600 mt-1">
            From {data.activeReferees} active{" "}
            {data.activeReferees === 1 ? "referee" : "referees"} (gross $
            {(data.grossMrrCents / 100).toFixed(2)}/mo).
          </p>
        </>
      ) : null}
    </div>
  );
}
