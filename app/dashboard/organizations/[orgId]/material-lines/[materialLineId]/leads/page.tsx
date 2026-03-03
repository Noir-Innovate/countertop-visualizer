import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import BillingExclusionToggle from "./components/BillingExclusionToggle";
import { getOrgAccess } from "@/lib/admin-auth";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
  searchParams: Promise<{ page?: string }>;
}

const LEADS_PER_PAGE = 20;

function formatSourceLabel(lead: {
  utm_source?: string | null;
  utm_medium?: string | null;
  referrer?: string | null;
}): string {
  if (lead.utm_source) return lead.utm_source;
  if (lead.utm_medium) return lead.utm_medium;
  if (lead.referrer) {
    try {
      return new URL(lead.referrer).hostname;
    } catch {
      return lead.referrer;
    }
  }
  return "—";
}

export default async function LeadsPage({ params, searchParams }: Props) {
  const { orgId, materialLineId } = await params;
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

  const access = await getOrgAccess(orgId);
  if (!access?.allowed) {
    notFound();
  }

  const db =
    access.role === "super_admin" ? await createServiceClient() : supabase;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();

  // Fetch material line
  const { data: materialLine } = await db
    .from("material_lines")
    .select("*")
    .eq("id", materialLineId)
    .eq("organization_id", orgId)
    .single();

  if (!materialLine) {
    notFound();
  }

  // Fetch organization name
  const { data: org } = await db
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  // Fetch total count
  const { count: totalLeads } = await db
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("material_line_id", materialLineId);

  // Fetch leads with pagination (include attribution for Source column)
  const { data: leads } = await db
    .from("leads")
    .select(
      "id, name, email, phone, created_at, selected_slab_id, utm_source, utm_medium, utm_campaign, referrer",
    )
    .eq("material_line_id", materialLineId)
    .order("created_at", { ascending: false })
    .range(offset, offset + LEADS_PER_PAGE - 1);

  const leadIds = (leads || []).map((lead) => lead.id);
  const usageByLeadId = new Map<
    string,
    {
      excluded_from_billing: boolean;
      stripe_invoice_id: string | null;
      stripe_invoice_status: string | null;
    }
  >();

  if (leadIds.length > 0) {
    const { data: usageRows } = await db
      .from("organization_billing_usage")
      .select(
        "lead_id, excluded_from_billing, stripe_invoice_id, stripe_invoice_status",
      )
      .in("lead_id", leadIds);

    for (const usageRow of usageRows || []) {
      usageByLeadId.set(usageRow.lead_id, {
        excluded_from_billing: usageRow.excluded_from_billing || false,
        stripe_invoice_id: usageRow.stripe_invoice_id || null,
        stripe_invoice_status: usageRow.stripe_invoice_status || null,
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
            href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}`}
            className="hover:text-slate-700"
          >
            {materialLine.name}
          </Link>
          <span>/</span>
          <span>Leads</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Leads</h1>
            <p className="text-slate-600 mt-1">
              {totalLeads || 0} total lead{totalLeads !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date Submitted
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Billing
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {leads && leads.length > 0 ? (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-900">
                        {lead.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-600">{lead.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-600">
                        {lead.phone || "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-600">
                        {formatSourceLabel(lead)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-600">
                        {new Date(lead.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(() => {
                        const usage = usageByLeadId.get(lead.id);
                        if (!usage) {
                          return (
                            <span className="text-xs text-slate-500">
                              Not tracked
                            </span>
                          );
                        }
                        if (usage.excluded_from_billing) {
                          return (
                            <span className="text-xs font-medium text-amber-700">
                              Excluded
                            </span>
                          );
                        }
                        if (usage.stripe_invoice_id) {
                          if (usage.stripe_invoice_status === "paid") {
                            return (
                              <span className="text-xs font-medium text-emerald-700">
                                Paid
                              </span>
                            );
                          }
                          if (
                            usage.stripe_invoice_status === "payment_failed"
                          ) {
                            return (
                              <span className="text-xs font-medium text-rose-700">
                                Payment Failed
                              </span>
                            );
                          }
                          return (
                            <span className="text-xs font-medium text-sky-700">
                              Invoice Created
                            </span>
                          );
                        }
                        return (
                          <span className="text-xs font-medium text-blue-700">
                            Billable
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="inline-flex items-center gap-3">
                        {profile?.is_super_admin && (
                          <BillingExclusionToggle
                            organizationId={orgId}
                            materialLineId={materialLineId}
                            leadId={lead.id}
                            excludedFromBilling={
                              usageByLeadId.get(lead.id)
                                ?.excluded_from_billing || false
                            }
                          />
                        )}
                        <Link
                          href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}/leads/${lead.id}`}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          View Details
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <p className="text-slate-500">No leads yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
