"use client";

import { useEventCount } from "./useEventCount";
import EventMetadata from "./EventMetadata";

interface GeneralAnalyticsProps {
  materialLineId: string;
  days: number;
}

function PageViewsCard({ materialLineId, days }: GeneralAnalyticsProps) {
  const { count } = useEventCount("page_view", materialLineId, days);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <p className="text-sm text-slate-500 mb-1">Page Views</p>
      <p className="text-3xl font-bold text-slate-900">
        {(count || 0).toLocaleString()}
      </p>
      <p className="text-xs text-slate-400 mt-1">
        Total visits to the visualizer
      </p>
      <EventMetadata
        eventName="page_view"
        eventCount={count || 0}
        materialLineId={materialLineId}
        days={days}
      />
    </div>
  );
}

function QuoteSubmittedCard({ materialLineId, days }: GeneralAnalyticsProps) {
  const { count } = useEventCount("quote_submitted", materialLineId, days);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <p className="text-sm text-slate-500 mb-1">Total Conversions</p>
      <p className="text-3xl font-bold text-slate-900">
        {(count || 0).toLocaleString()}
      </p>
      <p className="text-xs text-slate-400 mt-1">Quote requests</p>
      <EventMetadata
        eventName="quote_submitted"
        eventCount={count || 0}
        materialLineId={materialLineId}
        days={days}
      />
    </div>
  );
}

function ConversionRateCard({ materialLineId, days }: GeneralAnalyticsProps) {
  const { count: pageViews } = useEventCount("page_view", materialLineId, days);
  const { count: imageUploaded } = useEventCount(
    "image_uploaded",
    materialLineId,
    days,
  );
  const { count: imageSelected } = useEventCount(
    "image_selected",
    materialLineId,
    days,
  );
  const { count: quoteSubmitted } = useEventCount(
    "quote_submitted",
    materialLineId,
    days,
  );

  const step1Total = (imageUploaded || 0) + (imageSelected || 0);
  const overallConversionRate =
    step1Total > 0
      ? (((quoteSubmitted || 0) / step1Total) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <p className="text-sm text-slate-500 mb-1">Overall Conversion Rate</p>
      <p className="text-3xl font-bold text-slate-900">
        {overallConversionRate}%
      </p>
      <p className="text-xs text-slate-400 mt-1">
        From image selection to quote
      </p>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
        <div className="h-8 bg-slate-200 rounded w-32 mb-2"></div>
        <div className="h-3 bg-slate-200 rounded w-48"></div>
      </div>
    </div>
  );
}

export default function GeneralAnalytics({
  materialLineId,
  days,
}: GeneralAnalyticsProps) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        General Analytics
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PageViewsCard materialLineId={materialLineId} days={days} />
        <QuoteSubmittedCard materialLineId={materialLineId} days={days} />
        <ConversionRateCard materialLineId={materialLineId} days={days} />
      </div>
    </div>
  );
}
