"use client";

import { useEffect, useState } from "react";

interface ConnectState {
  stripeAccountId: string | null;
  status: string | null;
  payoutsEnabled: boolean;
  onboardedAt: string | null;
}

export function StripeConnectStatus() {
  const [state, setState] = useState<ConnectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/referrals/stripe-account");
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? "Failed to load status");
        setState(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load status");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function launch(mode: "onboarding" | "dashboard" = "onboarding") {
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch("/api/referrals/stripe-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) {
        const raw = body.error ?? "Failed to open Stripe";
        // Older accounts created before Express was enabled can't get a Login
        // Link — surface a useful message instead of the raw Stripe text.
        if (/does not have access to the Express Dashboard/i.test(raw)) {
          throw new Error(
            "This Stripe account predates dashboard support. Ask an admin to disconnect it so you can re-onboard.",
          );
        }
        throw new Error(raw);
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setLaunching(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-sm text-slate-500">
        Loading payout status…
      </div>
    );
  }

  const enabled = state?.payoutsEnabled ?? false;
  const accountExists = Boolean(state?.stripeAccountId);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Payouts</h2>
          <p className="text-sm text-slate-600 mt-1 max-w-xl">
            We pay affiliate commissions through Stripe. Stripe collects your
            tax info (W9/SSN), deposits payouts to your bank account, and
            issues your 1099-NEC at year-end.
          </p>
        </div>
        {enabled ? (
          <span className="inline-block px-3 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
            Active
          </span>
        ) : accountExists ? (
          <span className="inline-block px-3 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
            Setup incomplete
          </span>
        ) : (
          <span className="inline-block px-3 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
            Required
          </span>
        )}
      </div>

      <div className="mt-4">
        {enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700">
              Payouts are active. We&apos;ll send commissions to your Stripe
              balance and Stripe will deposit them on your bank schedule.
            </p>
            <button
              type="button"
              onClick={() => launch("dashboard")}
              disabled={launching}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-800 text-sm font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {launching ? "Opening Stripe…" : "Open Stripe dashboard"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => launch("onboarding")}
            disabled={launching}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {launching
              ? "Opening Stripe…"
              : accountExists
                ? "Continue Stripe setup"
                : "Set up payouts with Stripe"}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
