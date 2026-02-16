"use client";

import { useEventCount, type EventCountUtmFilters } from "./useEventCount";
import EventMetadata from "./EventMetadata";

interface Step2AnalyticsProps {
  materialLineId: string;
  days: number;
  utm?: EventCountUtmFilters | null;
}

function MaterialSelectedCard({
  materialLineId,
  days,
  utm,
}: Step2AnalyticsProps) {
  const { count } = useEventCount(
    "slab_selected",
    materialLineId,
    days,
    false,
    utm,
  );

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          Material Selected
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Materials selected (includes name & type)
      </p>
      <EventMetadata
        eventName="slab_selected"
        eventCount={count || 0}
        materialLineId={materialLineId}
        days={days}
        utm={utm}
      />
    </div>
  );
}

function SeeItPressedCard({ materialLineId, days, utm }: Step2AnalyticsProps) {
  const { count } = useEventCount(
    "generation_started",
    materialLineId,
    days,
    false,
    utm,
  );

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          See It Pressed
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Users clicked "See It" to generate
      </p>
    </div>
  );
}

function BackPressedCard({ materialLineId, days, utm }: Step2AnalyticsProps) {
  const { count } = useEventCount(
    "back_pressed",
    materialLineId,
    days,
    false,
    utm,
  );

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">Back Pressed</span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Users went back (from Step 2 or 3)
      </p>
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

export default function Step2Analytics({
  materialLineId,
  days,
  utm,
}: Step2AnalyticsProps) {
  return (
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
        <MaterialSelectedCard
          materialLineId={materialLineId}
          days={days}
          utm={utm}
        />
        <SeeItPressedCard
          materialLineId={materialLineId}
          days={days}
          utm={utm}
        />
        <BackPressedCard
          materialLineId={materialLineId}
          days={days}
          utm={utm}
        />
      </div>
    </div>
  );
}
