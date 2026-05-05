"use client";

import { useEffect, useState } from "react";

interface PayoutProfile {
  legal_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  paypal_email: string | null;
}

const EMPTY: PayoutProfile = {
  legal_name: null,
  address_line1: null,
  address_line2: null,
  city: null,
  region: null,
  postal_code: null,
  country: null,
  paypal_email: null,
};

export function PayoutProfileForm() {
  const [profile, setProfile] = useState<PayoutProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/referrals/payout-profile")
      .then((r) => r.json())
      .then((body) => {
        if (body.profile) setProfile({ ...EMPTY, ...body.profile });
      })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof PayoutProfile>(
    key: K,
    value: PayoutProfile[K],
  ) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/referrals/payout-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      setMessage("Saved.");
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-sm text-slate-500">
        Loading payout details…
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Payout details</h2>
        <p className="text-sm text-slate-600 mt-1">
          Payouts are sent via PayPal. Enter the email address linked to your
          PayPal account — we&apos;ll deposit your commissions there in batches.
        </p>
      </div>

      <Field
        label="Legal name (as it appears on your W9)"
        value={profile.legal_name}
        onChange={(v) => set("legal_name", v)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Address line 1"
          value={profile.address_line1}
          onChange={(v) => set("address_line1", v)}
        />
        <Field
          label="Address line 2"
          value={profile.address_line2}
          onChange={(v) => set("address_line2", v)}
        />
        <Field
          label="City"
          value={profile.city}
          onChange={(v) => set("city", v)}
        />
        <Field
          label="State / region"
          value={profile.region}
          onChange={(v) => set("region", v)}
        />
        <Field
          label="Postal code"
          value={profile.postal_code}
          onChange={(v) => set("postal_code", v)}
        />
        <Field
          label="Country"
          value={profile.country}
          onChange={(v) => set("country", v)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          PayPal email
        </label>
        <input
          type="email"
          value={profile.paypal_email ?? ""}
          onChange={(e) => set("paypal_email", e.target.value || null)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">
          Must match a verified PayPal account. If the email isn&apos;t linked
          to PayPal, the payout will sit unclaimed until you sign up.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save payout details"}
        </button>
        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
