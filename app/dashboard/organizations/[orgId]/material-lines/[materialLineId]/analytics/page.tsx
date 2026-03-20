import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import MaterialLineAnalyticsClient from "./MaterialLineAnalyticsClient";
import { getOrgAccess } from "@/lib/admin-auth";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
  searchParams: Promise<{
    days?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    trackingLinkId?: string;
  }>;
}

export default async function AnalyticsPage({ params, searchParams }: Props) {
  const { orgId, materialLineId } = await params;
  const resolvedSearchParams = await searchParams;

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
          <span>Analytics</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-600 mt-1">
            Conversion funnel and event metrics for this material line
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="animate-pulse">
            <div className="h-24 bg-slate-200 rounded mb-6" />
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-slate-200 rounded" />
              ))}
            </div>
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-slate-200 rounded" />
              ))}
            </div>
          </div>
        }
      >
        <MaterialLineAnalyticsClient
          key={`${materialLineId}-${resolvedSearchParams.days ?? "30"}`}
          materialLineId={materialLineId}
          orgId={orgId}
          orgName={org?.name ?? ""}
          materialLineName={materialLine.name}
          initialSearchParams={resolvedSearchParams}
        />
      </Suspense>
    </div>
  );
}
