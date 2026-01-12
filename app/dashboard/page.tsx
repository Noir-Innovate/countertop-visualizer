import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  // Define types for the query result
  interface MaterialLine {
    id: string;
    name: string;
    slug: string;
    custom_domain: string | null;
    custom_domain_verified: boolean;
  }

  interface Organization {
    id: string;
    name: string;
    role: string;
    material_lines?: MaterialLine[];
  }

  // Fetch user's organizations and their material lines
  const { data: memberships } = await supabase
    .from("organization_members")
    .select(
      `
      role,
      organizations(
        id, 
        name,
        material_lines(id, name, slug, custom_domain, custom_domain_verified)
      )
    `
    )
    .eq("profile_id", user.id);

  const organizations: Organization[] =
    memberships
      ?.map((m) => {
        const org = m.organizations as unknown as {
          id: string;
          name: string;
          material_lines?: MaterialLine[];
        } | null;
        return {
          id: org?.id || "",
          name: org?.name || "",
          role: m.role as string,
          material_lines: org?.material_lines || [],
        };
      })
      .filter((org) => org.id) || [];

  // Analytics queries removed - will be re-implemented with PostHog API later
  const totalPageViews = 0;
  const totalQuoteRequests = 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">
            Overview of all your organizations and material lines
          </p>
        </div>
        <Link
          href="/dashboard/organizations/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg
            className="w-5 h-5"
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
          Create Organization
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-500">Organizations</p>
              <p className="text-2xl font-bold text-slate-900">
                {organizations.length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Page Views</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalPageViews.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-amber-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-500">Quote Requests</p>
              <p className="text-2xl font-bold text-slate-900">
                {totalQuoteRequests.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Organizations */}
      {organizations.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            No Organizations Yet
          </h2>
          <p className="text-slate-600 mb-6">
            Create your first organization to start setting up material lines.
          </p>
          <Link
            href="/dashboard/organizations/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg
              className="w-5 h-5"
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
            Create Organization
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {organizations.map((org) => (
            <div
              key={org.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {org.name}
                  </h2>
                  <p className="text-sm text-slate-500 capitalize">
                    Your role: {org.role}
                  </p>
                </div>
                <Link
                  href={`/dashboard/organizations/${org.id}`}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View Details →
                </Link>
              </div>

              {org.material_lines && org.material_lines.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {org.material_lines.map((materialLine) => (
                    <Link
                      key={materialLine.id}
                      href={`/dashboard/organizations/${org.id}/material-lines/${materialLine.id}`}
                      className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {materialLine.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {materialLine.custom_domain &&
                          materialLine.custom_domain_verified
                            ? materialLine.custom_domain
                            : `${materialLine.slug}.${
                                process.env.NEXT_PUBLIC_APP_DOMAIN ||
                                "countertopvisualizer.com"
                              }`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {materialLine.custom_domain &&
                          !materialLine.custom_domain_verified && (
                            <span className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded-full">
                              DNS Pending
                            </span>
                          )}
                        <svg
                          className="w-5 h-5 text-slate-400"
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
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-8 text-center">
                  <p className="text-slate-500 mb-4">No material lines yet</p>
                  <Link
                    href={`/dashboard/organizations/${org.id}/material-lines/new`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
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
                    Create Material Line
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
