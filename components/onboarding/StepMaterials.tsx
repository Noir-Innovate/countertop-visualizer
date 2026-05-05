"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MaterialDraft } from "./OnboardingWizard";

interface Props {
  orgId: string;
  orgSlug: string;
  materials: MaterialDraft[];
  onChange: (next: MaterialDraft[]) => void;
  lineName: string;
  onLineNameChange: (value: string) => void;
}

export function StepMaterials({
  orgId: _orgId,
  orgSlug,
  materials,
  onChange,
  lineName,
  onLineNameChange,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update(index: number, patch: Partial<MaterialDraft>) {
    const next = materials.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function remove(index: number) {
    const next = materials.slice();
    next.splice(index, 1);
    onChange(next);
  }

  function addSampleMaterials() {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const drafts: MaterialDraft[] = SAMPLE_SLABS.map((s) => ({
      src_url: `${origin}${s.path}`,
      title: s.title,
      category: "Countertops",
      included: true,
    }));
    onChange([...materials, ...drafts]);
  }

  async function handleUpload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const supabase = createClient();
      const drafts: MaterialDraft[] = [];
      for (const file of list) {
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const path = `${orgSlug || "org"}/onboarding-uploads/material-${stamp}.${ext}`;
        const { error } = await supabase.storage
          .from("public-assets")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });
        if (error) throw new Error(error.message);
        drafts.push({
          src_url: null,
          uploaded_path: path,
          title: file.name.replace(/\.[^.]+$/, ""),
          category: "Countertops",
          included: true,
        });
      }
      onChange([...materials, ...drafts]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-xl font-semibold text-slate-900 mb-1">Materials</h2>
      <p className="text-sm text-slate-600 mb-5">
        Review what we found. Rename, recategorize, or remove anything that
        looks wrong. You can always add more later.
      </p>

      <label className="block mb-5">
        <span className="block text-sm font-medium text-slate-700 mb-1">
          Material line name
        </span>
        <input
          type="text"
          value={lineName}
          onChange={(e) => onLineNameChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
        />
      </label>

      {materials.length === 0 ? (
        <div className="border-2 border-dashed border-amber-300 bg-amber-50 rounded-lg p-6 text-center mb-4">
          <p className="text-sm text-amber-900 font-medium mb-1">
            We couldn&apos;t find any countertop materials on your site.
          </p>
          <p className="text-xs text-amber-800 mb-4">
            Start with our 5 sample slabs (you can edit or remove them later)
            or upload your own below.
          </p>
          <button
            type="button"
            onClick={addSampleMaterials}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700"
          >
            Use 5 sample materials
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {materials.map((m, i) => (
            <div
              key={i}
              className={`border rounded-lg overflow-hidden ${
                m.included
                  ? "border-slate-200"
                  : "border-slate-100 opacity-50"
              }`}
            >
              <div className="aspect-square bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    m.src_url ??
                    publicUrlForUpload(m.uploaded_path) ??
                    "/slabs/placeholder.png"
                  }
                  alt={m.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-3 space-y-2">
                <input
                  type="text"
                  value={m.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="w-full px-2 py-1 border border-slate-200 rounded text-sm"
                />
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-1.5 text-slate-700">
                    <input
                      type="checkbox"
                      checked={m.included}
                      onChange={(e) =>
                        update(i, { included: e.target.checked })
                      }
                    />
                    Include
                  </label>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-red-600 hover:text-red-700 text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
          if (!uploading && e.dataTransfer.files.length > 0) {
            handleUpload(e.dataTransfer.files);
          }
        }}
        className={`cursor-pointer border-2 border-dashed rounded-lg px-6 py-10 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
        } ${uploading ? "opacity-60 cursor-wait" : ""}`}
      >
        <svg
          className="mx-auto w-10 h-10 text-slate-400 mb-3"
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
          {uploading ? "Uploading…" : "Drop images here or click to browse"}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          PNG, JPG, or WEBP — you can select multiple
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleUpload(e.target.files);
            }
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

// Five hand-picked starter slabs from /public/slabs. Used when the scrape
// finds nothing on the site so the new org isn't stuck with an empty line.
const SAMPLE_SLABS: Array<{ path: string; title: string }> = [
  {
    path: "/slabs/Mightyslab_Calcatta_Oro_Full-512x1024.jpg",
    title: "Calacatta Oro",
  },
  {
    path: "/slabs/Mightyslab_Arabescato_Full-512x1024.jpg",
    title: "Arabescato",
  },
  {
    path: "/slabs/Mightyslab_Desert_Gray_Full-512x1024.jpg",
    title: "Desert Gray",
  },
  {
    path: "/slabs/Mightyslab_Sienna_Sand_Full-512x1024.jpg",
    title: "Sienna Sand",
  },
  {
    path: "/slabs/Mightyslab_Statuario_Classico-512x1024.jpg",
    title: "Statuario Classico",
  },
];

function publicUrlForUpload(path: string | undefined): string | null {
  if (!path) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${supabaseUrl}/storage/v1/object/public/public-assets/${path}`;
}
