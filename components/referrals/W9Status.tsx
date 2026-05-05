"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  onFile: boolean;
}

export function W9Status({ onFile: initialOnFile }: Props) {
  const [onFile, setOnFile] = useState(initialOnFile);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large (max 10MB).");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const path = `${user.id}/w9-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("w9-documents")
        .upload(path, file, { contentType: "application/pdf" });
      if (upErr) throw new Error(upErr.message);

      const res = await fetch("/api/referrals/w9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: path }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to record W9");
      }
      setOnFile(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Tax info (W9)
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            We need a signed W9 on file before we can send any payouts.
          </p>
        </div>
        {onFile ? (
          <span className="inline-block px-3 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
            On file
          </span>
        ) : (
          <span className="inline-block px-3 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
            Required
          </span>
        )}
      </div>
      <div className="mt-4">
        <label className="inline-block">
          <span className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg cursor-pointer hover:bg-slate-800">
            {uploading
              ? "Uploading…"
              : onFile
                ? "Replace W9 (PDF)"
                : "Upload W9 (PDF)"}
          </span>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFile}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
