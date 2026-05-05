"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  orgId: string;
  orgSlug: string;
  candidates: string[];
  selectedUrl: string | null;
  mode: "scraped" | "uploaded" | "none";
  onSelectScraped: (url: string) => void;
  onUploaded: (storagePath: string, publicUrl: string) => void;
  onClear: () => void;
}

export function StepLogo({
  orgId: _orgId,
  orgSlug,
  candidates,
  selectedUrl,
  mode,
  onSelectScraped,
  onUploaded,
  onClear,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  // Some scraped URLs return 404 / are CORS-blocked / have no intrinsic
  // dimensions (broken SVGs). Hide them from the picker as soon as the
  // browser tells us they failed.
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${orgSlug || "org"}/onboarding-uploads/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("public-assets")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (error) throw new Error(error.message);
      const {
        data: { publicUrl },
      } = supabase.storage.from("public-assets").getPublicUrl(path);
      onUploaded(path, publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const visibleCandidates = candidates.filter((u) => !brokenUrls.has(u));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-xl font-semibold text-slate-900 mb-1">Your logo</h2>
      <p className="text-sm text-slate-600 mb-5">
        Pick the logo we should use, or upload your own.
      </p>

      {selectedUrl && (
        <div className="mb-6 flex items-center gap-4 p-4 border border-slate-200 rounded-lg bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedUrl}
            alt="Selected logo"
            className="object-contain"
            style={{ height: "4rem", width: "auto", maxWidth: "200px" }}
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Selected</p>
            <p className="text-xs text-slate-500">
              {mode === "uploaded" ? "Uploaded by you" : "From your website"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
        </div>
      )}

      {visibleCandidates.length > 0 && (
        <>
          <p className="text-sm font-medium text-slate-700 mb-3">
            We found these on your website:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {visibleCandidates.map((url) => (
              <button
                type="button"
                key={url}
                onClick={() => onSelectScraped(url)}
                className={`flex items-center justify-center p-3 h-20 border rounded-lg transition ${
                  selectedUrl === url && mode === "scraped"
                    ? "border-blue-600 ring-2 ring-blue-200"
                    : "border-slate-200 hover:border-slate-400"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Logo candidate"
                  // Force explicit dimensions so SVGs without intrinsic
                  // width/height still render at a visible size.
                  style={{
                    height: "100%",
                    width: "100%",
                    objectFit: "contain",
                  }}
                  onError={() =>
                    setBrokenUrls((prev) => {
                      const next = new Set(prev);
                      next.add(url);
                      return next;
                    })
                  }
                />
              </button>
            ))}
          </div>
        </>
      )}

      <span className="block text-sm font-medium text-slate-700 mb-2">
        {visibleCandidates.length > 0
          ? "Or upload your own"
          : "Upload your logo"}
      </span>

      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files?.[0];
          if (!uploading && file) handleUpload(file);
        }}
        className={`cursor-pointer border-2 border-dashed rounded-lg px-6 py-8 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
        } ${uploading ? "opacity-60 cursor-wait" : ""}`}
      >
        <svg
          className="mx-auto w-8 h-8 text-slate-400 mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5V21"
          />
        </svg>
        <p className="text-sm font-medium text-slate-900">
          {uploading ? "Uploading…" : "Drop a logo here or click to browse"}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          PNG, JPG, WEBP, or SVG
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>

      {uploadError && (
        <p className="text-sm text-red-600 mt-2">{uploadError}</p>
      )}
    </div>
  );
}
