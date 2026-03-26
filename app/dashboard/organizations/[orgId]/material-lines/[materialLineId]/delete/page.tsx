"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { Toaster } from "react-hot-toast";
import { getMaterialLineBasePath } from "@/lib/material-line-path";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

export default function DeleteMaterialLinePage({ params }: Props) {
  const { orgId, materialLineId } = use(params);
  const router = useRouter();
  const [materialLineName, setMaterialLineName] = useState<string | null>(null);
  const [lineKind, setLineKind] = useState<"external" | "internal" | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const materialLineBasePath = getMaterialLineBasePath(
    orgId,
    materialLineId,
    lineKind,
  );

  const trimmedConfirmation = confirmation.trim();
  const trimmedName = materialLineName?.trim() ?? "";
  const canDelete =
    materialLineName !== null &&
    trimmedConfirmation.length > 0 &&
    trimmedConfirmation === trimmedName;

  useEffect(() => {
    const fetchMaterialLine = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("material_lines")
        .select("name, line_kind")
        .eq("id", materialLineId)
        .single();

      if (data) {
        setMaterialLineName(data.name);
        setLineKind(data.line_kind as "external" | "internal");
      }
      setLoading(false);
    };

    fetchMaterialLine();
  }, [materialLineId]);

  const handleDelete = async () => {
    if (!canDelete || !materialLineName) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/material-lines/${materialLineId}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmationName: confirmation }),
        },
      );

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(
          typeof payload.error === "string"
            ? payload.error
            : "Could not delete material line",
        );
        return;
      }

      toast.success("Material line deleted");
      router.push(`/dashboard/organizations/${orgId}`);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-1/3 mb-4" />
          <div className="h-4 bg-slate-200 rounded w-1/2 mb-8" />
          <div className="bg-white rounded-xl p-6 space-y-6">
            <div className="h-10 bg-slate-200 rounded" />
            <div className="h-10 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!materialLineName) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-slate-600">Material line not found</p>
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
            <Link href={materialLineBasePath} className="hover:text-slate-700">
              {materialLineName}
            </Link>
            <span>/</span>
            <span>Delete</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Delete material line
          </h1>
          <p className="text-slate-600 mt-1">
            This action cannot be undone.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-medium mb-2">You will permanently remove:</p>
            <ul className="list-disc list-inside space-y-1 text-red-800">
              <li>
                Slabs, kitchens, tracking links, notifications, and analytics
                events for this line
              </li>
              <li>
                Stored files for this line in the asset bucket (when the
                operation completes successfully)
              </li>
            </ul>
            <p className="mt-3 text-red-800">
              Some records (for example leads or billing usage) may keep a
              historical reference but will no longer be linked to this
              material line.
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-700 mb-2">
              Type the <strong>internal name</strong> exactly to confirm:
            </p>
            <p className="font-mono text-sm bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 mb-4">
              {materialLineName}
            </p>
            <label
              htmlFor="confirmName"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Internal name
            </label>
            <input
              id="confirmName"
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
              placeholder="Type the name exactly as shown above"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-200">
            <Link
              href={`${materialLineBasePath}/settings`}
              className="px-6 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-center"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={!canDelete || submitting}
              onClick={handleDelete}
              className="flex-1 py-3 px-6 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 focus:ring-4 focus:ring-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? "Deleting…" : "Delete material line"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
