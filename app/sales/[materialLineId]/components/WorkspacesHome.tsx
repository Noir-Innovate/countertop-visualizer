"use client";

import { useEffect, useState } from "react";
import NewWorkspaceModal from "./NewWorkspaceModal";

export interface WorkspaceGeneration {
  id: string;
  materialId: string | null;
  materialName: string | null;
  materialCategory: string;
  outputImageUrl: string | null;
  kitchenImageUrl: string | null;
  kitchenImagePath: string | null;
  generationOrder: number;
  createdAt: string;
}

export interface Workspace {
  id: string;
  sessionId: string;
  label: string;
  kitchenImagePath: string | null;
  kitchenImageUrl: string | null;
  createdAt: string;
  generations: WorkspaceGeneration[];
}

interface Props {
  jobId: string;
  /** Caller-provided initial list (page server-loads when possible); component
   *  also refreshes on mount to pick up any changes. */
  initialWorkspaces?: Workspace[];
  onEnterWorkspace: (workspace: Workspace) => void;
  onWorkspaceCreated: (workspace: Workspace) => void;
  /** Bump to force re-fetch (e.g. after returning from Stage 2). */
  refreshKey?: number;
}

export default function WorkspacesHome({
  jobId,
  initialWorkspaces,
  onEnterWorkspace,
  onWorkspaceCreated,
  refreshKey,
}: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(
    initialWorkspaces || [],
  );
  const [loading, setLoading] = useState(!initialWorkspaces);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch on jobId/refresh
    setLoading(true);
    fetch(`/api/sales/jobs/${jobId}/workspaces`)
      .then((r) => (r.ok ? r.json() : { workspaces: [] }))
      .then((json) => {
        if (cancelled) return;
        setWorkspaces((json.workspaces as Workspace[]) || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, refreshKey]);

  const handleCreated = (workspace: Workspace) => {
    setModalOpen(false);
    onWorkspaceCreated(workspace);
  };

  return (
    <div className="p-4">
      {loading ? (
        <p className="text-sm text-slate-500">Loading workspaces…</p>
      ) : workspaces.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-900 font-medium">No workspaces yet</p>
          <p className="text-sm text-slate-500 mt-1">
            Start one to pick a photo and begin designing.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + Start workspace
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => onEnterWorkspace(ws)}
              className="w-full text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {ws.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ws.generations.length} run
                    {ws.generations.length === 1 ? "" : "s"} ·{" "}
                    {new Date(ws.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs text-blue-600">Open →</span>
              </div>
              <div className="p-3">
                <div className="flex gap-2 overflow-x-auto">
                  {ws.kitchenImageUrl ? (
                    <div className="shrink-0">
                      <div className="w-24 h-24 rounded-md overflow-hidden bg-slate-100 border-2 border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ws.kitchenImageUrl}
                          alt="Original"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500 text-center w-24">
                        Original
                      </p>
                    </div>
                  ) : (
                    <div className="shrink-0">
                      <div className="w-24 h-24 rounded-md bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center text-[11px] text-slate-400 text-center px-2">
                        No photo yet
                      </div>
                    </div>
                  )}
                  {ws.generations.slice(0, 6).map((g) => (
                    <div key={g.id} className="shrink-0">
                      <div className="w-24 h-24 rounded-md overflow-hidden bg-slate-100 border border-slate-200">
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
                      <p className="mt-1 text-[10px] text-slate-600 truncate text-center w-24">
                        {g.materialName || g.materialCategory}
                      </p>
                    </div>
                  ))}
                  {ws.generations.length > 6 && (
                    <div className="shrink-0 self-center px-2 text-xs text-slate-500">
                      +{ws.generations.length - 6} more
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}

          <button
            onClick={() => setModalOpen(true)}
            className="w-full bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add another workspace
            </span>
          </button>
        </div>
      )}

      {modalOpen && (
        <NewWorkspaceModal
          jobId={jobId}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
