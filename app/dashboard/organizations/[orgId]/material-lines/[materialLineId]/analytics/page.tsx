import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import TimeframeSelector from "./components/TimeframeSelector";
import UtmSegmentSelector from "./components/UtmSegmentSelector";
import GeneralAnalytics from "./components/GeneralAnalytics";
import Step1Analytics from "./components/Step1Analytics";
import Step2Analytics from "./components/Step2Analytics";
import Step3Analytics from "./components/Step3Analytics";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
  searchParams: Promise<{
    days?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
}

export default async function AnalyticsPage({ params, searchParams }: Props) {
  const { orgId, materialLineId } = await params;
  const { days, utm_source, utm_medium, utm_campaign } = await searchParams;
  const daysToShow = parseInt(days || "30", 10);
  const utmSegment =
    utm_source || utm_medium || utm_campaign
      ? {
          utm_source: utm_source ?? null,
          utm_medium: utm_medium ?? null,
          utm_campaign: utm_campaign ?? null,
        }
      : null;

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
            <p className="text-slate-600 mt-1">
              Conversion funnel and performance metrics
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <TimeframeSelector currentDays={daysToShow} />
            <UtmSegmentSelector
              currentUtm={{ utm_source, utm_medium, utm_campaign }}
              currentDays={daysToShow}
            />
          </div>
        </div>
      </div>

      {/* General Analytics */}
      <Suspense
        fallback={
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              General Analytics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
                >
                  <div className="animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                    <div className="h-8 bg-slate-200 rounded w-32 mb-2"></div>
                    <div className="h-3 bg-slate-200 rounded w-48"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <GeneralAnalytics
          materialLineId={materialLineId}
          days={daysToShow}
          utm={utmSegment}
        />
      </Suspense>

      {/* Step-by-Step Analytics */}
      <div className="space-y-6">
        <Suspense
          fallback={
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Step 1</h2>
                  <p className="text-sm text-slate-500">
                    Image Upload & Selection
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-4">
                    <div className="animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-32 mb-2"></div>
                      <div className="h-6 bg-slate-200 rounded w-16 ml-auto"></div>
                      <div className="h-3 bg-slate-200 rounded w-48"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <Step1Analytics
            materialLineId={materialLineId}
            days={daysToShow}
            utm={utmSegment}
          />
        </Suspense>

        <Suspense
          fallback={
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Step 2</h2>
                  <p className="text-sm text-slate-500">
                    Material Selection & Generation
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-4">
                    <div className="animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-32 mb-2"></div>
                      <div className="h-6 bg-slate-200 rounded w-16 ml-auto"></div>
                      <div className="h-3 bg-slate-200 rounded w-48"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <Step2Analytics
            materialLineId={materialLineId}
            days={daysToShow}
            utm={utmSegment}
          />
        </Suspense>

        <Suspense
          fallback={
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Step 3</h2>
                  <p className="text-sm text-slate-500">
                    Results Viewing & Quote Submission
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-4">
                    <div className="animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-32 mb-2"></div>
                      <div className="h-6 bg-slate-200 rounded w-16 ml-auto"></div>
                      <div className="h-3 bg-slate-200 rounded w-48"></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-4">
                    <div className="animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-32 mb-2"></div>
                      <div className="h-6 bg-slate-200 rounded w-16 ml-auto"></div>
                      <div className="h-3 bg-slate-200 rounded w-48"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          }
        >
          <Step3Analytics
            materialLineId={materialLineId}
            days={daysToShow}
            utm={utmSegment}
          />
        </Suspense>
      </div>
    </div>
  );
}
