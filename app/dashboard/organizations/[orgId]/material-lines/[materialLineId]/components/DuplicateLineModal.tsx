"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface OrgOption {
  id: string;
  name: string;
  role: string;
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface DuplicateLineModalProps {
  materialLineId: string;
  sourceOrgId: string;
  currentSlug: string;
  currentName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const appDomain =
  process.env.NEXT_PUBLIC_APP_DOMAIN || "countertopvisualizer.com";

export default function DuplicateLineModal({
  materialLineId,
  sourceOrgId,
  currentSlug,
  currentName,
  isOpen,
  onClose,
  onSuccess,
}: DuplicateLineModalProps) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [targetOrgId, setTargetOrgId] = useState("");
  const [internalName, setInternalName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugFromNameOnly, setSlugFromNameOnly] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setTargetOrgId("");
    setInternalName(`${currentName} (Copy)`);
    setNewSlug(slugFromName(`${currentName} (Copy)`));
    setSlugFromNameOnly(true);
    setLoadingOrgs(true);
    fetch("/api/organizations/mine")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load organizations");
        return res.json();
      })
      .then((data: OrgOption[]) => {
        setOrganizations(data);
        if (data.length > 0) {
          setTargetOrgId(
            data.some((o) => o.id === sourceOrgId) ? sourceOrgId : data[0].id,
          );
        }
      })
      .catch(() => setError("Failed to load organizations"))
      .finally(() => setLoadingOrgs(false));
  }, [isOpen, sourceOrgId, currentName]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleInternalNameChange = (value: string) => {
    setInternalName(value);
    if (slugFromNameOnly) {
      setNewSlug(slugFromName(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugFromNameOnly(false);
    setNewSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const slugToSend = newSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "");
    try {
      const res = await fetch(
        `/api/material-lines/${materialLineId}/duplicate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetOrganizationId: targetOrgId,
            newSlug: slugToSend,
            name: internalName.trim() || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to duplicate");
        return;
      }
      onSuccess?.();
      onClose();
      router.push(
        `/dashboard/organizations/${data.targetOrganizationId}/material-lines/${data.id}`,
      );
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const normalizedSlug = newSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  const canSubmit =
    targetOrgId &&
    internalName.trim().length > 0 &&
    normalizedSlug.length > 0 &&
    !loading &&
    !loadingOrgs;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Duplicate Material Line
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close modal"
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="duplicate-internal-name"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Internal name
            </label>
            <input
              id="duplicate-internal-name"
              type="text"
              value={internalName}
              onChange={(e) => handleInternalNameChange(e.target.value)}
              placeholder="My Line (Copy)"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
            <p className="mt-1 text-xs text-slate-500">
              Shown in the dashboard. URL slug is derived from this unless you
              edit it below.
            </p>
          </div>

          <div>
            <label
              htmlFor="duplicate-target-org"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Duplicate into organization
            </label>
            <select
              id="duplicate-target-org"
              value={targetOrgId}
              onChange={(e) => setTargetOrgId(e.target.value)}
              disabled={loadingOrgs}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all disabled:opacity-50"
            >
              {loadingOrgs ? (
                <option value="">Loading…</option>
              ) : organizations.length === 0 ? (
                <option value="">
                  No organizations (must be owner or admin)
                </option>
              ) : (
                organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))
              )}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              You must be owner or admin of the selected organization.
            </p>
          </div>

          <div>
            <label
              htmlFor="duplicate-new-slug"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              New URL slug
            </label>
            <div className="flex items-center">
              <input
                id="duplicate-new-slug"
                type="text"
                value={newSlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="my-new-line"
                className="flex-1 px-4 py-2.5 rounded-l-lg border border-r-0 border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
              <span className="px-3 py-2.5 bg-slate-100 border border-slate-300 rounded-r-lg text-slate-500 text-sm whitespace-nowrap">
                .{appDomain}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Current: {currentSlug}.{appDomain}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 py-2.5 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {loading ? "Duplicating…" : "Duplicate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
