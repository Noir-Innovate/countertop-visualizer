"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  profileId: string;
  stripeAccountId: string | null;
}

export function StripeAdminActions({ profileId, stripeAccountId }: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    if (
      !confirm(
        "Unlink this affiliate's Stripe account? They'll need to onboard again before the next payout. (The Stripe account itself stays in your Connect dashboard.)",
      )
    ) {
      return;
    }
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/referrals/disconnect-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referrerProfileId: profileId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to disconnect");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!stripeAccountId) return null;

  // Test-mode dashboard URLs use the /test/ prefix. Detect using the account
  // ID prefix (acct_test_) — Stripe uses different prefixes per mode.
  const isTest = stripeAccountId.startsWith("acct_test_");
  const dashUrl = `https://dashboard.stripe.com/${isTest ? "test/" : ""}connect/accounts/${stripeAccountId}`;

  return (
    <div className="flex items-center gap-2 mt-1">
      <a
        href={dashUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 hover:underline"
      >
        View in Stripe ↗
      </a>
      <span className="text-slate-300">·</span>
      <button
        type="button"
        onClick={disconnect}
        disabled={disconnecting}
        className="text-xs text-red-600 hover:underline disabled:opacity-50"
      >
        {disconnecting ? "Disconnecting…" : "Disconnect"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
