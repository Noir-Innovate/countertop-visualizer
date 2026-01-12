import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getPostHogEventCounts } from "@/lib/posthog-server";

interface Props {
  params: Promise<{ orgId: string }>;
}

export default async function OrganizationPage({ params }: Props) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  // Verify user has access to this org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();

  if (!membership) {
    notFound();
  }

  // Fetch organization with material lines
  const { data: org } = await supabase
    .from("organizations")
    .select(
      `
      id,
      name,
      created_at,
      material_lines(id, name, slug, custom_domain, custom_domain_verified, created_at)
    `
    )
    .eq("id", orgId)
    .single();

  if (!org) {
    notFound();
  }

  // Fetch analytics from PostHog
  const materialLineIds = org.material_lines?.map((ml) => ml.id) || [];

  let pageViews = 0;
  let quoteRequests = 0;
  let generationsStarted = 0;

  if (materialLineIds.length > 0) {
    const [pv, qr, gs] = await getPostHogEventCounts([
      {
        eventName: "page_view",
        materialLineIds,
      },
      {
        eventName: "quote_submitted",
        materialLineIds,
      },
      {
        eventName: "generation_started",
        materialLineIds,
      },
    ]);

    pageViews = pv;
    quoteRequests = qr;
    generationsStarted = gs;
  }

  const conversionRate =
    pageViews > 0 ? ((quoteRequests / pageViews) * 100).toFixed(1) : "0.0";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-slate-700">
              Dashboard
            </Link>
            <span>/</span>
            <span>{org.name}</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">{org.name}</h1>
          <p className="text-slate-600 mt-1 capitalize">
            Your role: {membership.role}
          </p>
        </div>
        {(membership.role === "owner" || membership.role === "admin") && (
          <Link
            href={`/dashboard/organizations/${orgId}/material-lines/new`}
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
            New Material Line
          </Link>
        )}
      </div>

      {/* Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Material Lines</p>
          <p className="text-3xl font-bold text-slate-900">
            {org.material_lines?.length || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Page Views</p>
          <p className="text-3xl font-bold text-slate-900">
            {pageViews.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Generations</p>
          <p className="text-3xl font-bold text-slate-900">
            {generationsStarted.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">Quote Requests</p>
          <p className="text-3xl font-bold text-slate-900">
            {quoteRequests.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {conversionRate}% conversion
          </p>
        </div>
      </div>

      {/* Material Lines List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Material Lines
          </h2>
        </div>

        {org.material_lines && org.material_lines.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {org.material_lines.map((materialLine) => (
              <Link
                key={materialLine.id}
                href={`/dashboard/organizations/${orgId}/material-lines/${materialLine.id}`}
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
                <div className="flex items-center gap-3">
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
          <div className="px-6 py-12 text-center">
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
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No material lines yet
            </h3>
            <p className="text-slate-600 mb-6">
              Create your first material line to start using the visualizer.
            </p>
            <Link
              href={`/dashboard/organizations/${orgId}/material-lines/new`}
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
              Create Material Line
            </Link>
          </div>
        )}
      </div>

      {/* Team Section */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Team</h2>
          {membership.role === "owner" && (
            <Link
              href={`/dashboard/organizations/${orgId}/team`}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Manage Team →
            </Link>
          )}
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-slate-600">
            Invite team members to help manage your material lines.
          </p>
        </div>
      </div>
    </div>
  );
}
