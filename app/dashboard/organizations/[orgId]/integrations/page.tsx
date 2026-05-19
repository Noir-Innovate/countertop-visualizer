"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";

interface Props {
  params: Promise<{ orgId: string }>;
}

interface Integration {
  id: string;
  organization_id: string;
  provider: string;
  location_id: string;
  token_masked: string;
  enabled: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
}

export default function IntegrationsPage({ params }: Props) {
  const { orgId } = use(params);
  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [locationId, setLocationId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/integrations/ghl?orgId=${orgId}`);
    const data = await res.json();
    if (res.ok) {
      setIntegration(data.integration);
      if (data.integration) {
        setLocationId(data.integration.location_id);
        setEnabled(data.integration.enabled);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId) {
      toast.error("Location ID is required");
      return;
    }
    if (!integration && !apiToken) {
      toast.error("Private Integration Token is required");
      return;
    }
    setSaving(true);
    try {
      const isUpdate = !!integration;
      const method = isUpdate ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        orgId,
        locationId,
        enabled,
      };
      if (apiToken) body.apiToken = apiToken;
      const res = await fetch(`/api/integrations/ghl`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Saved");
      setApiToken("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(`/api/integrations/ghl/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message || "Test contact created in GHL");
      } else {
        toast.error(data.error || "Test failed");
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    if (
      !confirm(
        "Remove the GoHighLevel integration? All material lines that push to GHL will be turned off.",
      )
    ) {
      return;
    }
    const res = await fetch(`/api/integrations/ghl?orgId=${orgId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Integration removed");
      setIntegration(null);
      setLocationId("");
      setApiToken("");
      setEnabled(true);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Remove failed");
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse h-8 bg-slate-200 rounded w-1/3 mb-4" />
        <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="max-w-2xl mx-auto px-4 py-8">
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
              Organization
            </Link>
            <span>/</span>
            <span>Integrations</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Integrations</h1>
          <p className="text-slate-600 mt-1">
            Connect external tools to receive leads from your material lines.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                GoHighLevel
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Push new leads as contacts (with a detailed note) into your GHL
                sub-account. Configure once here, then turn on per material line
                in each line&apos;s settings.
              </p>
            </div>
            {integration && (
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  integration.enabled
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {integration.enabled ? "Enabled" : "Disabled"}
              </span>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Location ID
              </label>
              <input
                type="text"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                placeholder="e.g. abc123XYZ"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                Found in GHL under Settings → Business Profile.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Private Integration Token
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                placeholder={
                  integration
                    ? integration.token_masked + " (leave blank to keep)"
                    : "pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                Create in GHL: Settings → Private Integrations. Required scopes:{" "}
                <code>contacts.write</code>, <code>contacts.readonly</code>.
                Token is encrypted at rest.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="enabled" className="text-sm text-slate-700">
                Integration enabled (disable to pause all GHL pushes for this
                org)
              </label>
            </div>

            {integration?.last_tested_at && (
              <div
                className={`text-xs px-3 py-2 rounded-lg ${
                  integration.last_test_status === "ok"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                Last test:{" "}
                {new Date(integration.last_tested_at).toLocaleString()} —{" "}
                {integration.last_test_status === "ok"
                  ? "success"
                  : integration.last_test_error || "error"}
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-slate-200">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving
                  ? "Saving…"
                  : integration
                    ? "Save changes"
                    : "Save integration"}
              </button>
              {integration && (
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="px-5 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  {testing ? "Testing…" : "Test connection"}
                </button>
              )}
              {integration && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="ml-auto px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
