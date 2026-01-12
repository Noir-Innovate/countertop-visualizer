import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getPostHogEventCounts } from "@/lib/posthog-server";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

export default async function MaterialLinePage({ params }: Props) {
  const { orgId, materialLineId } = await params;
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

  // Fetch material line
  const { data: materialLine } = await supabase
    .from("material_lines")
    .select("*")
    .eq("id", materialLineId)
    .eq("organization_id", orgId)
    .single();

  if (!materialLine) {
    notFound();
  }

  // Fetch organization name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  // Check if materials exist
  const { data: materialFiles } = await supabase.storage
    .from("public-assets")
    .list(materialLine.supabase_folder);

  const materialCount =
    materialFiles?.filter((file) =>
      file.name.match(/\.(jpg|jpeg|png|webp|gif)$/i)
    ).length || 0;

  // Fetch analytics from PostHog for last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [pageViews, quoteRequests, generationsStarted, slabsSelected] =
    await getPostHogEventCounts([
      {
        eventName: "page_view",
        materialLineIds: [materialLineId],
        startDate: thirtyDaysAgo,
      },
      {
        eventName: "quote_submitted",
        materialLineIds: [materialLineId],
        startDate: thirtyDaysAgo,
      },
      {
        eventName: "generation_started",
        materialLineIds: [materialLineId],
        startDate: thirtyDaysAgo,
      },
      {
        eventName: "slab_selected",
        materialLineIds: [materialLineId],
        startDate: thirtyDaysAgo,
      },
    ]);

  // Fetch recent leads
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("id, name, email, created_at")
    .eq("material_line_id", materialLineId)
    .order("created_at", { ascending: false })
    .limit(5);

  const appDomain =
    process.env.NEXT_PUBLIC_APP_DOMAIN || "countertopvisualizer.com";
  const visualizerUrl =
    materialLine.custom_domain && materialLine.custom_domain_verified
      ? `https://${materialLine.custom_domain}`
      : `https://${materialLine.slug}.${appDomain}`;

  const conversionRate =
    (pageViews || 0) > 0
      ? (((quoteRequests || 0) / (pageViews || 1)) * 100).toFixed(1)
      : "0.0";

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
          <span>{materialLine.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {materialLine.name}
            </h1>
            <a
              href={visualizerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 mt-1"
            >
              {visualizerUrl.replace("https://", "")}
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
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
          {(membership.role === "owner" || membership.role === "admin") && (
            <Link
              href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}/settings`}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Settings
            </Link>
          )}
        </div>
      </div>

      {/* Analytics - Last 30 Days */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Last 30 Days
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">Page Views</p>
            <p className="text-3xl font-bold text-slate-900">
              {(pageViews || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">Materials Selected</p>
            <p className="text-3xl font-bold text-slate-900">
              {(slabsSelected || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">Generations</p>
            <p className="text-3xl font-bold text-slate-900">
              {(generationsStarted || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">Quote Requests</p>
            <p className="text-3xl font-bold text-slate-900">
              {(quoteRequests || 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {conversionRate}% conversion
            </p>
          </div>
        </div>
      </div>

      {/* Recent Leads */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent Leads</h2>
        </div>
        {recentLeads && recentLeads.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {recentLeads.map((lead) => (
              <div key={lead.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{lead.name}</p>
                    <p className="text-sm text-slate-500">{lead.email}</p>
                  </div>
                  <p className="text-sm text-slate-400">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-500">No leads yet</p>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}/settings`}
          className={`bg-white rounded-xl shadow-sm border p-6 hover:border-blue-300 transition-colors ${
            !materialLine.logo_url
              ? "border-amber-300 bg-amber-50"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-slate-900">Branding & Theme</h3>
            {!materialLine.logo_url && (
              <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                Action Needed
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {!materialLine.logo_url
              ? "Add a logo to customize your brand"
              : "Customize logo, colors, and appearance"}
          </p>
        </Link>
        <Link
          href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}/domain`}
          className={`bg-white rounded-xl shadow-sm border p-6 hover:border-blue-300 transition-colors ${
            !materialLine.custom_domain
              ? "border-amber-300 bg-amber-50"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-slate-900">Custom Domain</h3>
            {!materialLine.custom_domain && (
              <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                Action Needed
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {materialLine.custom_domain
              ? materialLine.custom_domain_verified
                ? "Domain configured and active"
                : "DNS verification pending"
              : "Connect your own custom domain"}
          </p>
        </Link>
        <Link
          href={`/dashboard/organizations/${orgId}/material-lines/${materialLineId}/slabs`}
          className={`bg-white rounded-xl shadow-sm border p-6 hover:border-blue-300 transition-colors ${
            materialCount === 0
              ? "border-amber-300 bg-amber-50"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-slate-900">Material Inventory</h3>
            {materialCount === 0 && (
              <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                Action Needed
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {materialCount === 0
              ? "Upload material images to get started"
              : `${materialCount} material${
                  materialCount !== 1 ? "s" : ""
                } available`}
          </p>
        </Link>
      </div>
    </div>
  );
}
