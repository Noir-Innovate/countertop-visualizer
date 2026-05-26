import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

interface Props {
  orgId: string;
  materialLineId: string;
  materialLineBasePath: string;
}

interface JobRow {
  id: string;
  address: string | null;
  name: string | null;
  email: string | null;
  created_at: string;
  salesperson_id: string | null;
  profiles: { full_name: string | null; id: string } | null;
}

const PREVIEW_LIMIT = 25;

export default async function SalespersonJobsPreview({
  orgId,
  materialLineId,
  materialLineBasePath,
}: Props) {
  // Service role: this is rendered for owners/admins/super_admins, but joining
  // through profiles via PostgREST can be finicky under RLS — keep it simple.
  const service = await createServiceClient();
  const { data, error } = await service
    .from("leads")
    .select(
      `
      id,
      address,
      name,
      email,
      created_at,
      salesperson_id,
      profiles:salesperson_id(id, full_name)
      `,
    )
    .eq("organization_id", orgId)
    .eq("material_line_id", materialLineId)
    .eq("source", "salesperson")
    .order("created_at", { ascending: false })
    .limit(PREVIEW_LIMIT);

  if (error) {
    console.error("[SalespersonJobsPreview] query failed:", error);
  }

  const rows = (data || []) as unknown as JobRow[];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Salesperson Jobs
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Jobs created by salespeople in the field for this line.
          </p>
        </div>
        <Link
          href={`${materialLineBasePath}/jobs`}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          View all
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            No jobs from salespeople yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-medium text-slate-600 px-4 py-2">
                    Salesperson
                  </th>
                  <th className="text-left font-medium text-slate-600 px-4 py-2">
                    Address
                  </th>
                  <th className="text-left font-medium text-slate-600 px-4 py-2">
                    Customer
                  </th>
                  <th className="text-left font-medium text-slate-600 px-4 py-2">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-900">
                      {row.profiles?.full_name || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-900">
                      {row.address || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {row.name || row.email || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
