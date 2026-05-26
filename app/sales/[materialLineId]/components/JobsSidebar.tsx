"use client";

import { useEffect, useRef, useState } from "react";

export interface Job {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
  selected_image_url: string | null;
  original_image_url: string | null;
  v2_session_id: string | null;
}

interface Props {
  materialLineId: string;
  jobs: Job[];
  activeJobId: string | null;
  onSelect: (job: Job) => void;
  onEdit: (job: Job) => void;
  onJobsUpdate: (jobs: Job[]) => void;
}

export default function JobsSidebar({
  materialLineId,
  jobs,
  activeJobId,
  onSelect,
  onEdit,
  onJobsUpdate,
}: Props) {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const term = search.trim();
    const id = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ materialLineId });
        if (term) params.set("q", term);
        const res = await fetch(`/api/sales/jobs?${params.toString()}`);
        if (!res.ok) return;
        const json = await res.json();
        if (id !== reqIdRef.current) return;
        onJobsUpdate((json.jobs as Job[]) || []);
      } finally {
        if (id === reqIdRef.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [search, materialLineId, onJobsUpdate]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-3 pb-2">
        <input
          type="search"
          placeholder="Search address, name, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading && jobs.length === 0 ? (
          <p className="text-xs text-slate-500 px-2 py-3">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-xs text-slate-500 px-2 py-3">
            No jobs yet. Tap “New Job” below to create one.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {jobs.map((job) => {
              const isActive = job.id === activeJobId;
              const sub = [job.name, job.email].filter(Boolean).join(" · ");
              return (
                <li key={job.id} className="group relative">
                  <button
                    onClick={() => onSelect(job)}
                    className={`w-full text-left pl-2 pr-9 py-2 rounded-md transition-colors ${
                      isActive
                        ? "bg-blue-50 ring-1 ring-blue-200"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {job.address || "(no address)"}
                    </p>
                    {sub && (
                      <p className="text-xs text-slate-400 truncate">{sub}</p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(job);
                    }}
                    aria-label="Edit job"
                    title="Edit job"
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-slate-700 hover:bg-white/80 transition-opacity"
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
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
