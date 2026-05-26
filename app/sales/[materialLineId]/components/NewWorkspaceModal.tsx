"use client";

import { useState } from "react";
import { uuidv4 } from "@/lib/uuid";
import type { Workspace } from "./WorkspacesHome";

interface Props {
  jobId: string;
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}

export default function NewWorkspaceModal({
  jobId,
  onClose,
  onCreated,
}: Props) {
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/jobs/${jobId}/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: uuidv4(),
          // Empty label → server auto-names Kitchen / Kitchen N.
          label: label.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add workspace");
      onCreated(json.workspace as Workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add workspace");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            New workspace
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label
              htmlFor="workspace-label"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Name
            </label>
            <input
              id="workspace-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              maxLength={60}
              placeholder="Kitchen, Bathroom, Fireplace…"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Leave blank to auto-name (Kitchen, Kitchen 2, …).
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Adding…" : "Add workspace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
