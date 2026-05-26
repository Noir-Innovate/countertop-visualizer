import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getOrgAccess } from "@/lib/admin-auth";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface JobRow {
  id: string;
  address: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
  salesperson_id: string | null;
  profiles: { id: string; full_name: string | null } | null;
}

const PER_PAGE = 50;

export default async function MaterialLineJobsPage({
  params,
  searchParams,
}: Props) {
  const { orgId, materialLineId } = await params;
  const { page } = await searchParams;
  const currentPage = Math.max(1, parseInt(page || "1", 10));
  const offset = (currentPage - 1) * PER_PAGE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard/login");

  const access = await getOrgAccess(orgId);
  if (!access?.allowed) notFound();
  if (
    access.role !== "owner" &&
    access.role !== "admin" &&
    access.role !== "super_admin"
  ) {
    redirect(`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`);
  }

  const service = await createServiceClient();
  const { data: org } = await service
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  const { data: line } = await service
    .from("material_lines")
    .select("name")
    .eq("id", materialLineId)
    .eq("organization_id", orgId)
    .single();
  if (!line) notFound();

  const { count: total } = await service
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("material_line_id", materialLineId)
    .eq("source", "salesperson");

  const { data, error } = await service
    .from("leads")
    .select(
      `
      id,
      address,
      name,
      email,
      phone,
      notes,
      gps_lat,
      gps_lng,
      created_at,
      salesperson_id,
      profiles:salesperson_id(id, full_name)
      `,
    )
    .eq("organization_id", orgId)
    .eq("material_line_id", materialLineId)
    .eq("source", "salesperson")
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (error) {
    console.error("[jobs page] query failed:", error);
  }

  const rows = (data || []) as unknown as JobRow[];
  const totalPages = Math.max(1, Math.ceil((total || 0) / PER_PAGE));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/dashboard" className="hover:text-slate-700">
            Dashboard
          </Link>
          <span>/</span>
          <Link
            href={`/dashboard/organizations/${orgId}`}
            className="hover:text-slate-700"
          >
            {org?.name}
          </Link>
          <span>/</span>
          <Link
            href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`}
            className="hover:text-slate-700"
          >
            {line.name}
          </Link>
          <span>/</span>
          <span>Salesperson Jobs</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Salesperson Jobs</h1>
        <p className="text-slate-600 mt-1">
          {total || 0} total job{total !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Salesperson
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Address
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  GPS
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    No salesperson jobs yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-900 whitespace-nowrap">
                      {row.profiles?.full_name || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-900">{row.address || "—"}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                      {row.name || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                      {row.email || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                      {row.phone || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                      {row.gps_lat != null && row.gps_lng != null
                        ? `${row.gps_lat.toFixed(4)}, ${row.gps_lng.toFixed(4)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600 max-w-xs truncate">
                      {row.notes || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Showing {offset + 1} to{" "}
              {Math.min(offset + PER_PAGE, total || 0)} of {total || 0}
            </div>
            <div className="flex items-center gap-2">
              {currentPage > 1 && (
                <Link
                  href={`?page=${currentPage - 1}`}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Previous
                </Link>
              )}
              {currentPage < totalPages && (
                <Link
                  href={`?page=${currentPage + 1}`}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
