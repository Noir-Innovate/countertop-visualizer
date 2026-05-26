import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

interface Props {
  materialLineId: string;
  materialLineBasePath: string;
}

interface UserRow {
  profileId: string;
  fullName: string;
  jobs30d: number;
  generations30d: number;
  lastActive: string | null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Card({
  label,
  value,
  emphasis = "hero",
}: {
  label: string;
  value: number;
  emphasis?: "hero" | "small";
}) {
  const isHero = emphasis === "hero";
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 ${
        isHero ? "p-6" : "p-4"
      }`}
    >
      <p
        className={`text-slate-500 uppercase tracking-wide ${
          isHero ? "text-xs" : "text-[11px]"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-semibold text-slate-900 ${
          isHero ? "text-3xl" : "text-xl"
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default async function InternalAnalyticsView({
  materialLineId,
  materialLineBasePath,
}: Props) {
  const service = await createServiceClient();
  // eslint-disable-next-line react-hooks/purity -- server component; runs once per request
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Salesperson leads (jobs) for this line — pull once, slice for counts.
  const { data: leads } = await service
    .from("leads")
    .select("id, salesperson_id, created_at")
    .eq("material_line_id", materialLineId)
    .eq("source", "salesperson");
  const allLeads = leads || [];
  const allLeadIds = allLeads.map((l) => l.id);
  const totalJobs = allLeads.length;
  const recentLeads = allLeads.filter((l) => l.created_at >= since30d);
  const recentJobs = recentLeads.length;

  // Workspaces under those jobs.
  let allWorkspaces: { session_id: string; lead_id: string; created_at: string }[] = [];
  if (allLeadIds.length > 0) {
    const { data } = await service
      .from("job_workspaces")
      .select("session_id, lead_id, created_at")
      .in("lead_id", allLeadIds);
    allWorkspaces = data || [];
  }
  const totalWorkspaces = allWorkspaces.length;
  const recentWorkspaces = allWorkspaces.filter(
    (w) => w.created_at >= since30d,
  ).length;
  const sessionIds = allWorkspaces.map((w) => w.session_id);
  const leadById = new Map(allLeads.map((l) => [l.id, l]));
  const leadIdBySession = new Map(allWorkspaces.map((w) => [w.session_id, w.lead_id]));

  // Generations under those sessions.
  let allGenerations: { session_id: string; created_at: string }[] = [];
  if (sessionIds.length > 0) {
    const { data } = await service
      .from("generated_images")
      .select("session_id, created_at")
      .in("session_id", sessionIds);
    allGenerations = data || [];
  }
  const totalGenerations = allGenerations.length;
  const recentGenerations = allGenerations.filter(
    (g) => g.created_at >= since30d,
  ).length;

  // Pivot per salesperson (last 30 days).
  const byUser = new Map<
    string,
    {
      jobs30d: number;
      generations30d: number;
      lastActive: string | null;
    }
  >();
  const touch = (profileId: string | null | undefined) => {
    if (!profileId) return null;
    let row = byUser.get(profileId);
    if (!row) {
      row = { jobs30d: 0, generations30d: 0, lastActive: null };
      byUser.set(profileId, row);
    }
    return row;
  };
  const bump = (row: { lastActive: string | null }, at: string) => {
    if (!row.lastActive || at > row.lastActive) row.lastActive = at;
  };
  for (const lead of recentLeads) {
    const row = touch(lead.salesperson_id);
    if (row) {
      row.jobs30d += 1;
      bump(row, lead.created_at);
    }
  }
  for (const gen of allGenerations) {
    if (gen.created_at < since30d) continue;
    const leadId = leadIdBySession.get(gen.session_id);
    if (!leadId) continue;
    const lead = leadById.get(leadId);
    const row = touch(lead?.salesperson_id);
    if (row) {
      row.generations30d += 1;
      bump(row, gen.created_at);
    }
  }
  const profileIds = Array.from(byUser.keys());
  const namesById = new Map<string, string | null>();
  if (profileIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    for (const p of profiles || []) namesById.set(p.id, p.full_name);
  }
  const topUsers: UserRow[] = Array.from(byUser.entries())
    .map(([profileId, row]) => ({
      profileId,
      fullName: namesById.get(profileId) || "Unknown",
      jobs30d: row.jobs30d,
      generations30d: row.generations30d,
      lastActive: row.lastActive,
    }))
    .sort((a, b) => {
      if (b.generations30d !== a.generations30d) {
        return b.generations30d - a.generations30d;
      }
      return b.jobs30d - a.jobs30d;
    })
    .slice(0, 10);

  const hasAnyRecent =
    recentJobs > 0 || recentWorkspaces > 0 || recentGenerations > 0;

  return (
    <div className="space-y-8">
      {/* All-time hero cards */}
      <section>
        <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
          Usage
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card label="Jobs" value={totalJobs} />
          <Card label="Workspaces" value={totalWorkspaces} />
          <Card label="Generations" value={totalGenerations} />
        </div>
      </section>

      {/* Last 30 days secondary row */}
      <section>
        <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">
          Last 30 days
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card label="Jobs" value={recentJobs} emphasis="small" />
          <Card label="Workspaces" value={recentWorkspaces} emphasis="small" />
          <Card label="Generations" value={recentGenerations} emphasis="small" />
        </div>
        {!hasAnyRecent && (
          <p className="mt-2 text-xs text-slate-500">
            No activity in the last 30 days.
          </p>
        )}
      </section>

      {/* Top salespeople */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
            Top salespeople — last 30 days
          </h2>
          <Link
            href={`${materialLineBasePath}/jobs`}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            View all jobs →
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {topUsers.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No salesperson activity yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-12">
                      #
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Jobs
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Generations
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Last active
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topUsers.map((u, i) => (
                    <tr key={u.profileId} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-400 tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-4 py-2 text-slate-900">{u.fullName}</td>
                      <td className="px-4 py-2 text-right text-slate-900 tabular-nums">
                        {u.jobs30d}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-900 tabular-nums">
                        {u.generations30d}
                      </td>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {relativeTime(u.lastActive)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
