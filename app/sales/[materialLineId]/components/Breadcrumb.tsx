"use client";

import type { SalesView } from "../state";

interface Props {
  view: SalesView;
  onJobHome: () => void;
  onWorkspace: () => void;
}

function Sep() {
  return (
    <svg
      className="w-3 h-3 text-slate-300 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

function truncate(text: string, max = 20): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export default function Breadcrumb({
  view,
  onJobHome,
  onWorkspace,
}: Props) {
  if (view.kind === "empty") {
    return null;
  }

  const job = view.job;
  const workspace =
    view.kind === "stage1" || view.kind === "stage2" ? view.workspace : null;
  const fullAddress = job.address || "(no address)";

  return (
    <nav className="flex items-center gap-1.5 text-sm min-w-0">
      <button
        onClick={onJobHome}
        className="text-slate-900 hover:text-blue-700 font-medium shrink-0"
        title={fullAddress}
      >
        {truncate(fullAddress)}
      </button>
      {workspace && (
        <>
          <Sep />
          <button
            onClick={onWorkspace}
            className="text-slate-900 hover:text-blue-700 font-medium truncate"
            title={workspace.label}
          >
            {workspace.label}
          </button>
        </>
      )}
    </nav>
  );
}
