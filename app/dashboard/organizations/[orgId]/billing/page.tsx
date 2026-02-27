"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ orgId: string }>;
}

interface BillingSummary {
  membershipRole: string;
  isSuperAdmin: boolean;
  leadPricing: {
    leadPriceCents: number | null;
    effectiveAt: string | null;
  };
  internalPlan: {
    monthlyPriceCents: number;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    nextBillingAt: string | null;
    planEndsAt: string | null;
    internalLineCount: number;
    hasCustomer: boolean;
  };
  usageMonthToDate: {
    leadCount: number;
    totalAmountCents: number;
  };
  leadBilling: {
    periodStartIso: string;
    periodEndIso: string;
    nextInvoiceRunAt: string;
  };
}

function formatUsd(cents: number | null) {
  if (cents === null) return "Not set";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function OrganizationBillingPage({ params }: Props) {
  const { orgId } = use(params);
  const router = useRouter();
  const [orgName, setOrgName] = useState("Organization");
  const [loading, setLoading] = useState(true);
  const [savingPrice, setSavingPrice] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [runningUsageInvoice, setRunningUsageInvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [leadPriceInput, setLeadPriceInput] = useState("");

  const canManageBilling = useMemo(() => {
    const role = summary?.membershipRole;
    return role === "owner" || role === "admin";
  }, [summary?.membershipRole]);
  const canEditLeadPricing = Boolean(summary?.isSuperAdmin);

  const internalPlanStatus = summary?.internalPlan.status ?? "inactive";
  const isPlanActiveLike = ["active", "trialing", "past_due"].includes(
    internalPlanStatus,
  );
  const showStartOrReactivate = !isPlanActiveLike;
  const canRunManualUsageInvoice = process.env.NODE_ENV !== "production";

  const refreshData = async () => {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();

      if (org?.name) {
        setOrgName(org.name);
      }

      const summaryResponse = await fetch(
        `/api/billing/summary?organizationId=${orgId}`,
      );
      const summaryBody = await summaryResponse.json();
      if (!summaryResponse.ok) {
        throw new Error(summaryBody.error || "Failed to load billing summary");
      }

      const nextSummary = summaryBody as BillingSummary;
      setSummary(nextSummary);
      setLeadPriceInput(
        nextSummary.leadPricing.leadPriceCents === null
          ? ""
          : (nextSummary.leadPricing.leadPriceCents / 100).toFixed(2),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const saveLeadPrice = async () => {
    setError(null);
    const dollars = Number(leadPriceInput);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setError("Lead price must be a valid non-negative number");
      return;
    }

    setSavingPrice(true);
    try {
      const leadPriceCents = Math.round(dollars * 100);
      const response = await fetch("/api/billing/lead-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId, leadPriceCents }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to save lead price");
      }
      toast.success("Lead price updated");
      await refreshData();
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save lead price";
      setError(message);
      toast.error(message);
    } finally {
      setSavingPrice(false);
    }
  };

  const startInternalPlanCheckout = async () => {
    setLoadingCheckout(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to initialize checkout");
      }

      if (!body.url) {
        throw new Error("Checkout URL not returned");
      }
      window.location.href = body.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize checkout";
      setError(message);
      toast.error(message);
      setLoadingCheckout(false);
    }
  };

  const openBillingPortal = async () => {
    setLoadingPortal(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to open billing portal");
      }

      if (!body.url) {
        throw new Error("Portal URL not returned");
      }
      window.location.href = body.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to open billing portal";
      setError(message);
      toast.error(message);
      setLoadingPortal(false);
    }
  };

  const runUsageInvoiceNow = async () => {
    if (!summary) return;
    setRunningUsageInvoice(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/invoice-lead-usage/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to run usage invoice");
      }

      const orgResult = (body.results || []).find(
        (row: { organizationId: string }) => row.organizationId === orgId,
      );

      if (!orgResult || orgResult.skipped) {
        toast.success(
          orgResult?.reason
            ? `Usage invoice skipped: ${orgResult.reason}`
            : "Usage invoice run completed",
        );
      } else {
        toast.success("Usage invoice created in Stripe");
      }

      await refreshData();
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to run usage invoice";
      setError(message);
      toast.error(message);
    } finally {
      setRunningUsageInvoice(false);
    }
  };

  return (
    <>
      <Toaster position="top-right" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-slate-700">
              Dashboard
            </Link>
            <span>/</span>
            <Link
              href={`/dashboard/organizations/${orgId}`}
              className="hover:text-slate-700"
            >
              {orgName}
            </Link>
            <span>/</span>
            <span>Billing</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Billing</h1>
          <p className="text-slate-600 mt-1">
            Manage lead pricing and internal line billing for this organization.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {loading || !summary ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-slate-600">Loading billing information...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Internal Lines Plan
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Flat $250/month per organization for unlimited internal
                    lines.
                  </p>
                </div>
                <span
                  className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    internalPlanStatus === "active"
                      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                      : internalPlanStatus === "trialing"
                        ? "bg-sky-100 text-sky-800 ring-1 ring-sky-300"
                        : internalPlanStatus === "past_due"
                          ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                          : "bg-slate-100 text-slate-700 ring-1 ring-slate-300"
                  }`}
                >
                  {internalPlanStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="p-4 rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500">Monthly Plan Price</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatUsd(summary.internalPlan.monthlyPriceCents)}
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500">Internal Lines</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {summary.internalPlan.internalLineCount}
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-500">
                    {summary.internalPlan.cancelAtPeriodEnd
                      ? "Plan Ends On"
                      : "Next Billing Date"}
                  </p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatDate(
                      summary.internalPlan.cancelAtPeriodEnd
                        ? summary.internalPlan.planEndsAt
                        : summary.internalPlan.nextBillingAt,
                    )}
                  </p>
                  {summary.internalPlan.cancelAtPeriodEnd ? (
                    <p className="text-xs text-slate-500 mt-2">
                      Plan remains active until this date.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-2">
                      You will be billed again on this date.
                    </p>
                  )}
                </div>
              </div>

              {canManageBilling && (
                <div className="flex flex-wrap gap-3 mt-6">
                  {showStartOrReactivate && (
                    <button
                      type="button"
                      onClick={startInternalPlanCheckout}
                      disabled={loadingCheckout}
                      className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loadingCheckout
                        ? "Redirecting..."
                        : "Start / Reactivate Internal Plan"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openBillingPortal}
                    disabled={
                      loadingPortal || !summary.internalPlan.hasCustomer
                    }
                    className="px-5 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    {loadingPortal ? "Opening..." : "Manage Billing Portal"}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-900">
                Lead Pricing
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Set the manual price per generated lead for this organization.
              </p>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="leadPrice"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Price per Lead (USD)
                  </label>
                  <input
                    id="leadPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={leadPriceInput}
                    onChange={(e) => setLeadPriceInput(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300"
                    disabled={!canEditLeadPricing}
                  />
                  <p className="mt-1 text-sm text-slate-500">
                    Current: {formatUsd(summary.leadPricing.leadPriceCents)}
                    {summary.leadPricing.effectiveAt
                      ? ` (since ${formatDate(summary.leadPricing.effectiveAt)})`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/dashboard/organizations/${orgId}/leads`}
                  className="block p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                >
                  <p className="text-xs text-slate-500">
                    Uninvoiced Month-to-date Leads
                  </p>
                  <p className="text-2xl font-bold text-slate-900">
                    {summary.usageMonthToDate.leadCount}
                  </p>
                  <p className="text-xs text-slate-500 mt-3">
                    Uninvoiced Month-to-date Lead Charges
                  </p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatUsd(summary.usageMonthToDate.totalAmountCents)}
                  </p>
                  <p className="text-xs text-slate-500 mt-3">
                    Lead Billing Period Ends
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatDate(summary.leadBilling.periodEndIso)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Lead usage is invoiced automatically in arrears each month.
                  </p>
                </Link>
              </div>

              {canEditLeadPricing && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={saveLeadPrice}
                    disabled={savingPrice}
                    className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingPrice ? "Saving..." : "Save Lead Price"}
                  </button>
                </div>
              )}

              {canRunManualUsageInvoice && (
                <div className="mt-5 pt-5 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={runUsageInvoiceNow}
                    disabled={runningUsageInvoice}
                    className="px-5 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    {runningUsageInvoice
                      ? "Running Usage Invoice..."
                      : "Run Usage Invoice Now (Non-Prod)"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
