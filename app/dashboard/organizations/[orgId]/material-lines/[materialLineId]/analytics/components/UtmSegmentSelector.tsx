"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";

interface UtmSegmentSelectorProps {
  currentUtm: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
  };
  currentDays: number;
}

export default function UtmSegmentSelector({
  currentUtm,
  currentDays,
}: UtmSegmentSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [source, setSource] = useState(currentUtm.utm_source ?? "");
  const [medium, setMedium] = useState(currentUtm.utm_medium ?? "");
  const [campaign, setCampaign] = useState(currentUtm.utm_campaign ?? "");

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", currentDays.toString());
    if (source.trim()) params.set("utm_source", source.trim());
    else params.delete("utm_source");
    if (medium.trim()) params.set("utm_medium", medium.trim());
    else params.delete("utm_medium");
    if (campaign.trim()) params.set("utm_campaign", campaign.trim());
    else params.delete("utm_campaign");
    router.push(`?${params.toString()}`);
  }, [source, medium, campaign, currentDays, router, searchParams]);

  const clearFilters = useCallback(() => {
    setSource("");
    setMedium("");
    setCampaign("");
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", currentDays.toString());
    params.delete("utm_source");
    params.delete("utm_medium");
    params.delete("utm_campaign");
    router.push(`?${params.toString()}`);
  }, [currentDays, router, searchParams]);

  const hasFilters =
    (currentUtm.utm_source ?? "") ||
    (currentUtm.utm_medium ?? "") ||
    (currentUtm.utm_campaign ?? "");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-slate-500">Segment by UTM:</span>
      <input
        type="text"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        placeholder="Source"
        className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        type="text"
        value={medium}
        onChange={(e) => setMedium(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        placeholder="Medium"
        className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        type="text"
        value={campaign}
        onChange={(e) => setCampaign(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        placeholder="Campaign"
        className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={applyFilters}
        className="px-2 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 rounded hover:bg-blue-50"
      >
        Apply
      </button>
      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="px-2 py-1.5 text-sm text-slate-600 hover:text-slate-800"
        >
          Clear
        </button>
      )}
    </div>
  );
}
