"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MaterialLineProvider, type MaterialLineConfig } from "@/lib/material-line";
import V2Visualizer from "@/components/v2/V2Visualizer";
import type { ExampleKitchen } from "@/lib/types";
import JobsSidebar, { type Job } from "./JobsSidebar";
import LineSwitcher, { type AssignedLineOption } from "./LineSwitcher";
import NewJobModal from "./NewJobModal";
import WorkspacesHome, { type Workspace } from "./WorkspacesHome";
import Breadcrumb from "./Breadcrumb";
import Stage1 from "./Stage1";
import MobileQuickCapture, {
  type QuickCaptureResult,
} from "./MobileQuickCapture";
import ProfileMenu from "./ProfileMenu";
import type { SalesView } from "../state";
import type { VersionEntry } from "@/lib/v2/types";

function generationsToVersions(
  generations: Workspace["generations"],
): VersionEntry[] {
  return generations
    .filter((g) => g.outputImageUrl)
    .map((g) => ({
      id: g.id,
      imageData: "",
      imageUrl: g.outputImageUrl ?? undefined,
      materialCategory: g.materialCategory,
      materialName: g.materialName || g.materialCategory,
      materialId: g.materialId ?? undefined,
      generationOrder: g.generationOrder,
      timestamp: new Date(g.createdAt).getTime(),
    }));
}

interface Props {
  materialLine: MaterialLineConfig;
  assignedLines: AssignedLineOption[];
  initialJobs: Job[];
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

export default function SalesPortalShell({
  materialLine,
  assignedLines,
  initialJobs,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [view, setView] = useState<SalesView>({ kind: "empty" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  // Close the drawer by default on mobile (after first paint to avoid hydration
  // mismatch). Desktop keeps it open.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setDrawerOpen(false);
    }
  }, []);

  // Swipe gestures: open by swiping right from the left edge, close by swiping
  // left on the drawer.
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dy) > 60) return; // mostly vertical → not a horizontal swipe
    if (Date.now() - start.time > 600) return; // too slow
    if (!drawerOpen && start.x < 24 && dx > 60) setDrawerOpen(true);
    else if (drawerOpen && dx < -60) setDrawerOpen(false);
  };

  const customKitchens = useMemo<ExampleKitchen[]>(() => {
    if (!materialLine.kitchenImages || materialLine.kitchenImages.length === 0) {
      return [];
    }
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      (typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.hostname}:54321`
        : "http://127.0.0.1:54321");
    return materialLine.kitchenImages
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((img) => ({
        id: img.id,
        name: img.title || `Kitchen ${img.order}`,
        imageUrl: `${supabaseUrl}/storage/v1/object/public/public-assets/${materialLine.supabaseFolder}/kitchens/${img.filename}`,
      }));
  }, [materialLine]);

  /** Always land on the workspaces home so the rep sees the room list. */
  const enterJob = useCallback(async (job: Job) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/jobs/${job.id}/workspaces`);
      const json = res.ok ? await res.json() : { workspaces: [] };
      setView({
        kind: "workspaces",
        job,
        workspaces: (json.workspaces as Workspace[]) || [],
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const closeDrawerOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setDrawerOpen(false);
    }
  };

  const handleJobCreated = (result: { job: Job; workspace: Workspace | null }) => {
    setJobs((prev) => [result.job, ...prev]);
    setNewJobOpen(false);
    if (result.workspace) {
      setView({ kind: "stage1", job: result.job, workspace: result.workspace });
    } else {
      setView({ kind: "workspaces", job: result.job, workspaces: [] });
    }
    closeDrawerOnMobile();
  };

  const handleJobUpdated = (result: { job: Job; workspace: Workspace | null }) => {
    setJobs((prev) => prev.map((j) => (j.id === result.job.id ? result.job : j)));
    setView((curr) => {
      if (curr.kind === "empty") return curr;
      if (curr.job.id !== result.job.id) return curr;
      return { ...curr, job: result.job };
    });
    setEditingJob(null);
  };

  const handleWorkspaceCreated = (workspace: Workspace) => {
    if (view.kind === "empty") return;
    setView({ kind: "stage1", job: view.job, workspace });
  };

  const handleEnterWorkspace = async (workspace: Workspace) => {
    if (view.kind === "empty") return;
    if (workspace.kitchenImageUrl && workspace.kitchenImagePath) {
      setBusy(true);
      try {
        const seed = await urlToDataUrl(workspace.kitchenImageUrl);
        setView({
          kind: "stage2",
          job: view.job,
          workspace,
          seedImageDataUrl: seed,
        });
        return;
      } catch {
        // fall through to stage1
      } finally {
        setBusy(false);
      }
    }
    setView({ kind: "stage1", job: view.job, workspace });
  };

  const handleStage1KitchenPicked = async (
    imageDataUrl: string,
    kitchenImagePath: string,
  ) => {
    if (view.kind !== "stage1") return;
    try {
      await fetch(
        `/api/sales/jobs/${view.job.id}/workspaces/${view.workspace.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kitchenImagePath }),
        },
      );
    } catch (e) {
      console.error("[shell] persist kitchen path failed:", e);
    }
    setView({
      kind: "stage2",
      job: view.job,
      workspace: { ...view.workspace, kitchenImagePath },
      seedImageDataUrl: imageDataUrl,
    });
  };

  const handleStage1RunSeed = async (imageDataUrl: string) => {
    if (view.kind !== "stage1") return;
    setView({
      kind: "stage2",
      job: view.job,
      workspace: view.workspace,
      seedImageDataUrl: imageDataUrl,
    });
  };

  const handleQuickCapture = (result: QuickCaptureResult) => {
    setJobs((prev) => [result.job, ...prev]);
    setView({
      kind: "stage2",
      job: result.job,
      workspace: result.workspace,
      seedImageDataUrl: result.kitchenImageDataUrl,
    });
    closeDrawerOnMobile();
  };

  const toJobHome = async () => {
    if (view.kind === "empty") return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/jobs/${view.job.id}/workspaces`);
      const json = res.ok ? await res.json() : { workspaces: [] };
      setView({
        kind: "workspaces",
        job: view.job,
        workspaces: (json.workspaces as Workspace[]) || [],
      });
      setRefreshKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };
  const toStage1 = () => {
    if (view.kind === "stage2") {
      setView({ kind: "stage1", job: view.job, workspace: view.workspace });
    }
  };

  const sidebar = (
    <>
      {/* Breadcrumb header — only shown on mobile so the main pane stays clean. */}
      <div className="lg:hidden px-3 pt-3 pb-2 border-b border-slate-200">
        {view.kind === "empty" ? (
          <span className="text-xs uppercase tracking-wide text-slate-400">
            Jobs
          </span>
        ) : (
          <Breadcrumb
            view={view}
            onJobHome={() => {
              toJobHome();
              closeDrawerOnMobile();
            }}
            onWorkspace={() => {
              toJobHome();
              closeDrawerOnMobile();
            }}
          />
        )}
      </div>
      <div className="px-3 py-3 border-b border-slate-200 space-y-2">
        <LineSwitcher current={materialLine.id} lines={assignedLines} />
      </div>
      <JobsSidebar
        materialLineId={materialLine.id}
        jobs={jobs}
        activeJobId={view.kind !== "empty" ? view.job.id : null}
        onSelect={(job) => {
          enterJob(job);
          closeDrawerOnMobile();
        }}
        onEdit={(job) => setEditingJob(job)}
        onJobsUpdate={setJobs}
      />
      <div className="border-t border-slate-200 p-3 space-y-2">
        <button
          onClick={() => setNewJobOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
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
          New Job
        </button>
        <ProfileMenu />
      </div>
    </>
  );

  return (
    <MaterialLineProvider materialLine={materialLine}>
      <div
        className="h-screen flex bg-slate-50 overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Backdrop (mobile only) */}
        {drawerOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden fixed inset-0 z-30 bg-slate-900/40"
          />
        )}

        {/* Sidebar / drawer */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200
            flex flex-col overflow-hidden transform transition-transform duration-200 ease-out
            lg:static lg:translate-x-0 lg:shrink-0
            ${drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            ${drawerOpen ? "lg:w-72" : "lg:w-0 lg:-ml-px lg:border-r-0"}
          `}
        >
          {sidebar}
        </aside>

        {/* Main pane */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white">
            <button
              onClick={() => setDrawerOpen((o) => !o)}
              aria-label={drawerOpen ? "Hide menu" : "Show menu"}
              className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <rect
                  x="3"
                  y="4"
                  width="18"
                  height="16"
                  rx="2"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 4v16"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {/* Breadcrumb in the main bar — desktop only. */}
            <div className="hidden lg:block flex-1 min-w-0">
              <Breadcrumb
                view={view}
                onJobHome={toJobHome}
                onWorkspace={toJobHome}
              />
            </div>
            <div className="lg:hidden flex-1" />
            {busy && (
              <span className="text-xs text-slate-400">Loading…</span>
            )}
          </header>

          {view.kind === "stage2" && (
            <div className="px-4 py-2 border-b border-slate-200 bg-white">
              <button
                onClick={toStage1}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
              >
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {view.kind === "empty" && (
              <div className="p-6 text-sm text-slate-500">
                Pick a job from the menu, or tap the camera button to capture a
                new one.
              </div>
            )}
            {view.kind === "workspaces" && (
              <WorkspacesHome
                jobId={view.job.id}
                initialWorkspaces={view.workspaces}
                refreshKey={refreshKey}
                onEnterWorkspace={handleEnterWorkspace}
                onWorkspaceCreated={handleWorkspaceCreated}
              />
            )}
            {view.kind === "stage1" && (
              <Stage1
                workspace={view.workspace}
                customKitchens={customKitchens}
                onKitchenPicked={handleStage1KitchenPicked}
                onSeedFromRun={handleStage1RunSeed}
                refreshKey={refreshKey}
              />
            )}
            {view.kind === "stage2" && (
              <V2Visualizer
                key={`${view.workspace.id}:${view.seedImageDataUrl.slice(0, 32)}`}
                kitchenImage={view.seedImageDataUrl}
                sessionId={view.workspace.sessionId}
                onChangePhoto={toStage1}
                enableMaterialSearch
                initialVersions={generationsToVersions(view.workspace.generations)}
              />
            )}
          </div>
        </main>

        <MobileQuickCapture
          materialLineId={materialLine.id}
          onComplete={handleQuickCapture}
        />

        {newJobOpen && (
          <NewJobModal
            materialLineId={materialLine.id}
            onClose={() => setNewJobOpen(false)}
            onSaved={handleJobCreated}
          />
        )}
        {editingJob && (
          <NewJobModal
            materialLineId={materialLine.id}
            existingJob={editingJob}
            onClose={() => setEditingJob(null)}
            onSaved={handleJobUpdated}
          />
        )}
      </div>
    </MaterialLineProvider>
  );
}
