"use client";

import { useState } from "react";

interface Props {
  code: string;
}

export function ShareCodeBlock({ code: initialCode }: Props) {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialCode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard/signup?ref=${code}`
      : `/dashboard/signup?ref=${code}`;

  function copy(value: string, kind: "code" | "url") {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(kind);
        setTimeout(() => setCopied(null), 1500);
      },
      () => undefined,
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/referrals/code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to update code");
      }
      setCode(body.code);
      setDraft(body.code);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update code");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Your referral code
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(code);
              setError(null);
              setEditing(true);
            }}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Edit
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Code
          </p>
          {editing ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) =>
                    setDraft(e.target.value.toUpperCase().slice(0, 12))
                  }
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="MYCODE"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || draft === code}
                  className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(code);
                    setError(null);
                  }}
                  disabled={saving}
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-slate-500">
                6–12 characters, letters/numbers/dashes. Changing it
                immediately invalidates the old code.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-base">
                {code}
              </code>
              <button
                type="button"
                onClick={() => copy(code, "code")}
                className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {copied === "code" ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Share link
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => copy(shareUrl, "url")}
              className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {copied === "url" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
