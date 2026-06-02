"use client";

import { useState } from "react";

interface Member {
  id: string;
  profile_id: string;
  role: string;
  profiles: {
    full_name: string | null;
    email?: string | null;
  };
}

interface OrgMaterialLine {
  id: string;
  name: string;
  line_kind: "internal" | "external";
}

interface ManageLinesModalProps {
  orgId: string;
  member: Member;
  materialLines: OrgMaterialLine[];
  initialAssignedIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ManageLinesModal({
  orgId,
  member,
  materialLines,
  initialAssignedIds,
  onClose,
  onSaved,
}: ManageLinesModalProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialAssignedIds),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/members/${member.id}/lines`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedMaterialLineIds: Array.from(selected),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update assignments");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const displayName =
    member.profiles.full_name || member.profiles.email || "this sales person";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">
            Assigned Material Lines
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Choose which lines {displayName} can see and create jobs for.
          </p>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {materialLines.length === 0 ? (
            <p className="text-sm text-slate-500">
              This organization has no material lines yet.
            </p>
          ) : (
            <div className="space-y-1">
              {materialLines.map((line) => (
                <label
                  key={line.id}
                  className="flex items-center gap-2 px-2 py-2 hover:bg-slate-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(line.id)}
                    onChange={() => toggle(line.id)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">{line.name}</span>
                  {line.line_kind === "internal" && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      internal
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
