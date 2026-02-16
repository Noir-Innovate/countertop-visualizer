"use client";

import { useEventCount, type EventCountUtmFilters } from "./useEventCount";
import EventMetadata from "./EventMetadata";

interface Step3AnalyticsProps {
  materialLineId: string;
  days: number;
  utm?: EventCountUtmFilters | null;
}

function SawItCard({ materialLineId, days, utm }: Step3AnalyticsProps) {
  const { count } = useEventCount("saw_it", materialLineId, days, false, utm);

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">Saw It</span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Images finished loading & user stayed
      </p>
    </div>
  );
}

function ViewModeChangedCard({
  materialLineId,
  days,
  utm,
}: Step3AnalyticsProps) {
  const { count } = useEventCount(
    "view_mode_changed",
    materialLineId,
    days,
    false,
    utm,
  );

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          View Mode Changed
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Switched between Carousel/Compare
      </p>
    </div>
  );
}

function MaterialViewedCard({
  materialLineId,
  days,
  utm,
}: Step3AnalyticsProps) {
  const { count } = useEventCount(
    "material_viewed",
    materialLineId,
    days,
    false,
    utm,
  );

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          Materials Viewed
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">Users viewed specific materials</p>
    </div>
  );
}

function GetQuotePressedCard({
  materialLineId,
  days,
  utm,
}: Step3AnalyticsProps) {
  const { count } = useEventCount(
    "lead_form_submitted",
    materialLineId,
    days,
    false,
    utm,
  );

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          Get Quote Pressed
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">Users clicked "Get Quote"</p>
    </div>
  );
}

function PhoneVerifiedCard({ materialLineId, days, utm }: Step3AnalyticsProps) {
  const { count } = useEventCount(
    "verification_successful",
    materialLineId,
    days,
    false,
    utm,
  );

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          Phone Verified
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Phone numbers successfully verified
      </p>
    </div>
  );
}

function QuoteSubmittedCard({
  materialLineId,
  days,
  utm,
}: Step3AnalyticsProps) {
  const { count } = useEventCount(
    "quote_submitted",
    materialLineId,
    days,
    false,
    utm,
  );

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          Quote Submitted
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Quote requests submitted (includes material name & zip)
      </p>
      <EventMetadata
        eventName="quote_submitted"
        eventCount={count || 0}
        materialLineId={materialLineId}
        days={days}
        utm={utm}
      />
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-32 mb-2"></div>
        <div className="h-6 bg-slate-200 rounded w-16 ml-auto"></div>
        <div className="h-3 bg-slate-200 rounded w-48"></div>
      </div>
    </div>
  );
}

export default function Step3Analytics({
  materialLineId,
  days,
  utm,
}: Step3AnalyticsProps) {
  return (
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
        <SawItCard materialLineId={materialLineId} days={days} utm={utm} />
        <ViewModeChangedCard
          materialLineId={materialLineId}
          days={days}
          utm={utm}
        />
        <MaterialViewedCard
          materialLineId={materialLineId}
          days={days}
          utm={utm}
        />
        <GetQuotePressedCard
          materialLineId={materialLineId}
          days={days}
          utm={utm}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PhoneVerifiedCard
          materialLineId={materialLineId}
          days={days}
          utm={utm}
        />
        <QuoteSubmittedCard
          materialLineId={materialLineId}
          days={days}
          utm={utm}
        />
      </div>
    </div>
  );
}
