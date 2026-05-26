"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  profileId: string;
  defaultAmountCents: number;
  stripePayoutsEnabled: boolean;
}

export function PayoutForm({
  profileId,
  defaultAmountCents,
  stripePayoutsEnabled,
}: Props) {
  const router = useRouter();
  const [amountUsd, setAmountUsd] = useState(
    (defaultAmountCents / 100).toFixed(2),
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = Math.round(parseFloat(amountUsd) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("Enter an amount > $0");
      return;
    }
    if (
      !confirm(
        `Send $${(cents / 100).toFixed(2)} to this affiliate via Stripe?`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/referrals/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrerProfileId: profileId,
          amountCents: cents,
          note: note || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(humanizeError(body.error));
        setSubmitting(false);
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!stripePayoutsEnabled) {
    return (
      <span className="text-xs text-amber-700">
        Awaiting Stripe onboarding
      </span>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="number"
        step="0.01"
        min="0"
        value={amountUsd}
        onChange={(e) => setAmountUsd(e.target.value)}
        className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
        placeholder="0.00"
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note"
        className="w-28 px-2 py-1 border border-slate-300 rounded text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="px-3 py-1 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send Stripe payout"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

function humanizeError(code: string | undefined): string {
  switch (code) {
    case "stripe_onboarding_required":
      return "Affiliate hasn't finished Stripe onboarding";
    default:
      return code ?? "Failed to send payout";
  }
}
