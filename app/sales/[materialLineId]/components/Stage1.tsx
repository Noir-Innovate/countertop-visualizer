"use client";

import { useEffect, useState } from "react";
import V2KitchenUpload from "@/components/v2/V2KitchenUpload";
import type { ExampleKitchen } from "@/lib/types";
import type { Workspace, WorkspaceGeneration } from "./WorkspacesHome";

interface Props {
  workspace: Workspace;
  customKitchens: ExampleKitchen[];
  /** Called with a base64 data url + the storage path of the uploaded kitchen. */
  onKitchenPicked: (
    imageDataUrl: string,
    kitchenImagePath: string,
  ) => void | Promise<void>;
  /** Called when a prior render is selected — its image becomes the seed. */
  onSeedFromRun: (
    imageDataUrl: string,
    generation: WorkspaceGeneration,
  ) => void | Promise<void>;
  /** Re-fetch runs after a workspace switch. */
  refreshKey?: number;
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

export default function Stage1({
  workspace,
  customKitchens,
  onKitchenPicked,
  onSeedFromRun,
  refreshKey,
}: Props) {
  const [runs, setRuns] = useState<WorkspaceGeneration[]>(workspace.generations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRuns(workspace.generations);
  }, [workspace.id, workspace.generations, refreshKey]);

  const handleKitchenSelect = async (base64: string) => {
    setBusy(true);
    setError(null);
    try {
      // 1. Upload to storage so the workspace + future generations can
      //    reference the kitchen by storage path.
      const upload = await fetch("/api/v2/upload-kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData: base64,
          sessionId: workspace.sessionId,
        }),
      });
      if (!upload.ok) {
        const j = await upload.json().catch(() => ({}));
        throw new Error(j.error || "Kitchen upload failed");
      }
      const { storagePath } = (await upload.json()) as { storagePath: string };
      await onKitchenPicked(base64, storagePath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to use that kitchen");
    } finally {
      setBusy(false);
    }
  };

  const handleRunClick = async (run: WorkspaceGeneration) => {
    if (!run.outputImageUrl) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await urlToDataUrl(run.outputImageUrl);
      await onSeedFromRun(dataUrl, run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load that render");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <V2KitchenUpload
        onKitchenSelect={handleKitchenSelect}
        customKitchens={customKitchens}
      />

      {runs.length > 0 && (
        <div className="w-full max-w-4xl mx-auto">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">
            Recent renders
          </p>
          <div className="grid grid-cols-3 gap-4">
            {runs.map((g) => (
              <button
                key={g.id}
                onClick={() => handleRunClick(g)}
                disabled={busy || !g.outputImageUrl}
                className="group text-left disabled:opacity-50"
                title={`Continue from ${g.materialName || g.materialCategory}`}
              >
                <div className="aspect-[4/3] w-full rounded-lg overflow-hidden bg-slate-100 border border-slate-200 group-hover:border-blue-400 transition-colors">
                  {g.outputImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={g.outputImageUrl}
                      alt={g.materialName || g.materialCategory}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <p className="mt-1.5 text-sm text-slate-700 truncate">
                  {g.materialName || g.materialCategory}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
