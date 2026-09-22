"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface MorawareIntegration {
  id: string;
  tenant: string | null;
  username: string | null;
  password_masked: string;
  enabled: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
}

export default function MorawareCard({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState<MorawareIntegration | null>(null);
  const [tenant, setTenant] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/integrations/moraware?orgId=${orgId}`);
    const data = await res.json();
    if (res.ok) {
      setIntegration(data.integration);
      if (data.integration) {
        setTenant(data.integration.tenant ?? "");
        setUsername(data.integration.username ?? "");
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
    if (!tenant || !username) {
      toast.error("Tenant and username are required");
      return;
    }
    if (!integration && !password) {
      toast.error("Password is required");
      return;
    }
    setSaving(true);
    try {
      const method = integration ? "PATCH" : "POST";
      const body: Record<string, unknown> = { orgId, tenant, username, enabled };
      if (password) body.password = password;
      const res = await fetch(`/api/integrations/moraware`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Saved");
      setPassword("");
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
      const res = await fetch(`/api/integrations/moraware/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (data.status === "ok") toast.success("Connected to Moraware");
      else toast.error(data.error || "Connection failed");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove the Moraware integration?")) return;
    const res = await fetch(`/api/integrations/moraware?orgId=${orgId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Integration removed");
      setIntegration(null);
      setTenant("");
      setUsername("");
      setPassword("");
      setEnabled(true);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Remove failed");
    }
  }

  if (loading) {
    return <div className="animate-pulse h-64 bg-slate-100 rounded-xl mt-6" />;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Moraware</h2>
          <p className="text-sm text-slate-600 mt-1">
            Once a day we tag Moraware jobs that came from the visualizer with a
            note (&ldquo;Generated Image on Sterling&apos;s Visualizer&rdquo;),
            matched to your leads by email or address, so you can report on them.
            Read-only except for that one note.
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
            Tenant
          </label>
          <input
            type="text"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
            placeholder="e.g. asf (for asf.moraware.net)"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            The subdomain prefix of your Moraware URL.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            placeholder="your Moraware login"
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
            autoComplete="new-password"
            placeholder={
              integration
                ? integration.password_masked + " (leave blank to keep)"
                : "your Moraware password"
            }
          />
          <p className="mt-1 text-xs text-slate-500">
            Encrypted at rest and never shown again after saving. Moraware allows
            one session per login, so a dedicated integration user is best.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="moraware-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor="moraware-enabled" className="text-sm text-slate-700">
            Integration enabled (disable to pause the daily reconcile for this org)
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
            Last test: {new Date(integration.last_tested_at).toLocaleString()} —{" "}
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
            {saving ? "Saving…" : integration ? "Save changes" : "Save integration"}
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
  );
}
