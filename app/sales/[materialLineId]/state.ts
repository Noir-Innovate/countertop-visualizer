import type { Job } from "./components/JobsSidebar";
import type { Workspace } from "./components/WorkspacesHome";

/**
 * Single discriminated union driving the entire main pane. Every UI transition
 * goes through the pure helpers below — no scattered useState toggles.
 */
export type SalesView =
  | { kind: "empty" }
  | { kind: "workspaces"; job: Job; workspaces: Workspace[] }
  | { kind: "stage1"; job: Job; workspace: Workspace }
  | {
      kind: "stage2";
      job: Job;
      workspace: Workspace;
      seedImageDataUrl: string;
    };

export const EMPTY_VIEW: SalesView = { kind: "empty" };

/** Compute the default view for a job based on its workspaces. */
export function viewForJob(job: Job, workspaces: Workspace[]): SalesView {
  if (workspaces.length === 0) return { kind: "workspaces", job, workspaces };
  if (workspaces.length >= 2) return { kind: "workspaces", job, workspaces };
  const ws = workspaces[0];
  // 1 workspace + photo set → straight to Stage 2 with the kitchen as seed
  // (the seed image data url must be fetched by the caller). For server-load,
  // start in Stage 1 if no photo, otherwise we surface a "loading seed" by
  // letting the caller drive the transition. Keep it lazy by returning Stage 1
  // when seed isn't yet available.
  if (!ws.kitchenImagePath) return { kind: "stage1", job, workspace: ws };
  return { kind: "stage1", job, workspace: ws };
}

export function toJobHome(view: SalesView, workspaces?: Workspace[]): SalesView {
  if (view.kind === "empty") return view;
  return {
    kind: "workspaces",
    job: view.job,
    workspaces: workspaces ?? (view.kind === "workspaces" ? view.workspaces : []),
  };
}

export function toStage1(view: SalesView, workspace?: Workspace): SalesView {
  if (view.kind === "empty") return view;
  const ws =
    workspace ??
    (view.kind === "stage1" || view.kind === "stage2"
      ? view.workspace
      : null);
  if (!ws) return view;
  return { kind: "stage1", job: view.job, workspace: ws };
}

export function toStage2(
  view: SalesView,
  workspace: Workspace,
  seedImageDataUrl: string,
): SalesView {
  if (view.kind === "empty") return view;
  return { kind: "stage2", job: view.job, workspace, seedImageDataUrl };
}

export function clearJob(): SalesView {
  return EMPTY_VIEW;
}
