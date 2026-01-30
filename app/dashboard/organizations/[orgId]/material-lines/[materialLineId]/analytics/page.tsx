import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getPostHogEventCounts } from "@/lib/posthog-server";
import EventMetadata from "./components/EventMetadata";
import TimeframeSelector from "./components/TimeframeSelector";

interface Props {
  params: Promise<{ orgId: string; materialLineId: string }>;
  searchParams: Promise<{ days?: string }>;
}

export default async function AnalyticsPage({ params, searchParams }: Props) {
  const { orgId, materialLineId } = await params;
  const { days } = await searchParams;
  const daysToShow = parseInt(days || "30", 10);

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

  // Calculate date range
  const now = new Date();
  const startDate = new Date(now.getTime() - daysToShow * 24 * 60 * 60 * 1000);

  // Fetch page views for general analytics
  const [pageViews] = await getPostHogEventCounts([
    {
      eventName: "page_view",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
  ]);

  // Fetch all analytics events organized by step
  const [
    // Step 1 events
    imageUploaded,
    imageSelected,
    // Step 2 events
    materialSelected,
    seeItPressed,
    backPressedTotal,
    // Step 3 events
    sawIt,
    viewModeChanged,
    materialViewed,
    getQuotePressed,
    phoneVerified,
    quoteSubmitted,
  ] = await getPostHogEventCounts([
    // Step 1
    {
      eventName: "image_uploaded",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    {
      eventName: "image_selected",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    // Step 2
    {
      eventName: "slab_selected",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    {
      eventName: "generation_started",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    {
      eventName: "back_pressed",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    // Step 3
    {
      eventName: "saw_it",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    {
      eventName: "view_mode_changed",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    {
      eventName: "material_viewed",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    {
      eventName: "lead_form_submitted",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    {
      eventName: "verification_successful",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
    {
      eventName: "quote_submitted",
      materialLineIds: [materialLineId],
      startDate: startDate,
    },
  ]);

  // Calculate totals
  const step1Total = (imageUploaded || 0) + (imageSelected || 0);
  const step2Total = (materialSelected || 0) + (seeItPressed || 0);
  const step3Total =
    (sawIt || 0) +
    (viewModeChanged || 0) +
    (materialViewed || 0) +
    (getQuotePressed || 0) +
    (phoneVerified || 0) +
    (quoteSubmitted || 0);

  // Calculate conversion rates
  const overallConversionRate =
    step1Total > 0
      ? (((quoteSubmitted || 0) / step1Total) * 100).toFixed(1)
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
          <TimeframeSelector currentDays={daysToShow} />
        </div>
      </div>

      {/* General Analytics */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          General Analytics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">Page Views</p>
            <p className="text-3xl font-bold text-slate-900">
              {(pageViews || 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Total visits to the visualizer
            </p>
            <EventMetadata
              eventName="page_view"
              eventCount={pageViews || 0}
              materialLineId={materialLineId}
              days={daysToShow}
            />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">Total Conversions</p>
            <p className="text-3xl font-bold text-slate-900">
              {(quoteSubmitted || 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">Quote requests</p>
            <EventMetadata
              eventName="quote_submitted"
              eventCount={quoteSubmitted || 0}
              materialLineId={materialLineId}
              days={daysToShow}
            />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">
              Overall Conversion Rate
            </p>
            <p className="text-3xl font-bold text-slate-900">
              {overallConversionRate}%
            </p>
            <p className="text-xs text-slate-400 mt-1">
              From image selection to quote
            </p>
          </div>
        </div>
      </div>

      {/* Step-by-Step Analytics */}
      <div className="space-y-6">
        {/* Step 1: Image Upload & Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
              1
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Step 1</h2>
              <p className="text-sm text-slate-500">Image Upload & Selection</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Image Uploaded
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(imageUploaded || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Users uploaded their own image
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Image Selected
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(imageSelected || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Users selected an example kitchen image
              </p>
            </div>
          </div>
        </div>

        {/* Step 2: Material Selection & Generation */}
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
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Material Selected
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(materialSelected || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Materials selected (includes name & type)
              </p>
              <EventMetadata
                eventName="slab_selected"
                eventCount={materialSelected || 0}
                materialLineId={materialLineId}
                days={daysToShow}
              />
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  See It Pressed
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(seeItPressed || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Users clicked "See It" to generate
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Back Pressed
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(backPressedTotal || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Users went back (from Step 2 or 3)
              </p>
            </div>
          </div>
        </div>

        {/* Step 3: Results Viewing & Quote Submission */}
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
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Saw It
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(sawIt || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Images finished loading & user stayed
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  View Mode Changed
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(viewModeChanged || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Switched between Carousel/Compare
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Materials Viewed
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(materialViewed || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Users viewed specific materials
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Get Quote Pressed
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(getQuotePressed || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Users clicked "Get Quote"
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Phone Verified
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(phoneVerified || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Phone numbers successfully verified
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  Quote Submitted
                </span>
                <span className="text-2xl font-bold text-slate-900">
                  {(quoteSubmitted || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Quote requests submitted (includes material name & zip)
              </p>
              <EventMetadata
                eventName="quote_submitted"
                eventCount={quoteSubmitted || 0}
                materialLineId={materialLineId}
                days={daysToShow}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
