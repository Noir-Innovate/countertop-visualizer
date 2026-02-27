import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import BillingExclusionToggle from "../material-lines/[materialLineId]/leads/components/BillingExclusionToggle";
import { getMaterialLineBasePath } from "@/lib/material-line-path";
import type { MaterialLineKind } from "@/lib/material-line-path";

interface Props {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ page?: string }>;
}

const LEADS_PER_PAGE = 25;

export default async function OrganizationLeadsPage({
  params,
  searchParams,
}: Props) {
  const { orgId } = await params;
  const { page } = await searchParams;
  const currentPage = parseInt(page || "1", 10);
  const offset = (currentPage - 1) * LEADS_PER_PAGE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  const [{ data: membership }, { data: profile }, { data: org }] =
    await Promise.all([
      supabase
        .from("organization_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("organization_id", orgId)
        .single(),
      supabase
        .from("profiles")
        .select("is_super_admin")
        .eq("id", user.id)
        .single(),
      supabase.from("organizations").select("name").eq("id", orgId).single(),
    ]);

  if (!membership) {
    notFound();
  }

  const { count: totalLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, email, phone, created_at, material_line_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + LEADS_PER_PAGE - 1);

  const leadIds = (leads || []).map((lead) => lead.id);
  const materialLineIds = [
    ...new Set(
      (leads || [])
        .map((lead) => lead.material_line_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const usageByLeadId = new Map<
    string,
    {
      excluded_from_billing: boolean;
      stripe_invoice_id: string | null;
      stripe_invoice_status: string | null;
      billed_amount_cents: number;
    }
  >();
  if (leadIds.length > 0) {
    const { data: usageRows } = await supabase
      .from("organization_billing_usage")
      .select(
        "lead_id, excluded_from_billing, stripe_invoice_id, stripe_invoice_status, billed_amount_cents",
      )
      .in("lead_id", leadIds);

    for (const usage of usageRows || []) {
      usageByLeadId.set(usage.lead_id, {
        excluded_from_billing: usage.excluded_from_billing || false,
        stripe_invoice_id: usage.stripe_invoice_id || null,
        stripe_invoice_status: usage.stripe_invoice_status || null,
        billed_amount_cents: usage.billed_amount_cents || 0,
      });
    }
  }

  const materialLineById = new Map<
    string,
    { name: string; lineKind: MaterialLineKind }
  >();
  if (materialLineIds.length > 0) {
    const { data: materialLines } = await supabase
      .from("material_lines")
      .select("id, name, line_kind")
      .in("id", materialLineIds);
    for (const materialLine of materialLines || []) {
      materialLineById.set(materialLine.id, {
        name: materialLine.name,
        lineKind:
          materialLine.line_kind === "internal" ? "internal" : "external",
      });
    }
  }

  const totalPages = Math.ceil((totalLeads || 0) / LEADS_PER_PAGE);

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
            href={`/dashboard/organizations/${orgId}/billing`}
            className="hover:text-slate-700"
          >
            Billing
          </Link>
          <span>/</span>
          <span>All Leads</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">
          Organization Leads
        </h1>
        <p className="text-slate-600 mt-1">
          {totalLeads || 0} total lead{totalLeads !== 1 ? "s" : ""} across all
          material lines
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Material Line
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date Submitted
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Charge
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Billing Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {leads && leads.length > 0 ? (
                leads.map((lead) => {
                  const usage = usageByLeadId.get(lead.id);
                  const status = usage
                    ? usage.excluded_from_billing
                      ? "Excluded"
                      : usage.stripe_invoice_id
                        ? usage.stripe_invoice_status === "paid"
                          ? "Paid"
                          : usage.stripe_invoice_status === "payment_failed"
                            ? "Payment Failed"
                            : "Invoice Created"
                        : "Billable"
                    : "Not tracked";
                  const materialLine = lead.material_line_id
                    ? materialLineById.get(lead.material_line_id)
                    : null;
                  const materialLineName = materialLine
                    ? materialLine.name
                    : "No material line";

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">
                          {lead.name}
                        </div>
                        <div className="text-sm text-slate-600">
                          {lead.email}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {materialLineName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {new Date(lead.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {usage
                          ? `$${(usage.billed_amount_cents / 100).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            status === "Excluded"
                              ? "text-amber-700"
                              : status === "Paid"
                                ? "text-emerald-700"
                                : status === "Payment Failed"
                                  ? "text-rose-700"
                                  : status === "Invoice Created"
                                    ? "text-sky-700"
                                    : status === "Billable"
                                      ? "text-blue-700"
                                      : "text-slate-500"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="inline-flex items-center gap-3">
                          {profile?.is_super_admin && usage && (
                            <BillingExclusionToggle
                              organizationId={orgId}
                              materialLineId={lead.material_line_id}
                              leadId={lead.id}
                              excludedFromBilling={usage.excluded_from_billing}
                            />
                          )}
                          {lead.material_line_id ? (
                            <Link
                              href={`${getMaterialLineBasePath(
                                orgId,
                                lead.material_line_id,
                                materialLine?.lineKind || "external",
                              )}/leads`}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              Open Line Leads
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <p className="text-slate-500">No leads yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Showing {offset + 1} to{" "}
              {Math.min(offset + LEADS_PER_PAGE, totalLeads || 0)} of{" "}
              {totalLeads || 0} leads
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
