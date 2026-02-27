"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  organizationId: string;
  materialLineId?: string | null;
  leadId: string;
  excludedFromBilling: boolean;
}

export default function BillingExclusionToggle({
  organizationId,
  materialLineId,
  leadId,
  excludedFromBilling,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/billing/lead-usage/${leadId}/toggle-exclusion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            materialLineId,
            excludedFromBilling: !excludedFromBilling,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to update exclusion");
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update exclusion",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className="text-xs text-slate-700 hover:text-slate-900 underline disabled:opacity-50"
      >
        {saving
          ? "Saving..."
          : excludedFromBilling
            ? "Include in Billing"
            : "Exclude from Billing"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
