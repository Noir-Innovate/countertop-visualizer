"use client";

import { useEventCount } from "./useEventCount";

interface Step1AnalyticsProps {
  materialLineId: string;
  days: number;
}

function ImageUploadedCard({ materialLineId, days }: Step1AnalyticsProps) {
  const { count } = useEventCount("image_uploaded", materialLineId, days);

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          Image Uploaded
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">Users uploaded their own image</p>
    </div>
  );
}

function ImageSelectedCard({ materialLineId, days }: Step1AnalyticsProps) {
  const { count } = useEventCount("image_selected", materialLineId, days);

  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          Image Selected
        </span>
        <span className="text-2xl font-bold text-slate-900">
          {(count || 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Users selected an example kitchen image
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

export default function Step1Analytics({
  materialLineId,
  days,
}: Step1AnalyticsProps) {
  return (
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
        <ImageUploadedCard materialLineId={materialLineId} days={days} />
        <ImageSelectedCard materialLineId={materialLineId} days={days} />
      </div>
    </div>
  );
}
