"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect } from "react";

interface TrackingLink {
  id: string;
  name: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface UtmSegmentSelectorProps {
  currentUtm: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
  };
  currentDays: number;
  materialLineId?: string;
}

export default function UtmSegmentSelector({
  currentUtm,
  currentDays,
  materialLineId,
}: UtmSegmentSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trackingLinkId = searchParams.get("trackingLinkId") ?? undefined;

  const [source, setSource] = useState(currentUtm.utm_source ?? "");
  const [medium, setMedium] = useState(currentUtm.utm_medium ?? "");
  const [campaign, setCampaign] = useState(currentUtm.utm_campaign ?? "");
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);

  useEffect(() => {
    setSource(currentUtm.utm_source ?? "");
    setMedium(currentUtm.utm_medium ?? "");
    setCampaign(currentUtm.utm_campaign ?? "");
  }, [currentUtm.utm_source, currentUtm.utm_medium, currentUtm.utm_campaign]);

  useEffect(() => {
    if (!materialLineId) {
      setTrackingLinks([]);
      return;
    }
    fetch(`/api/material-lines/${materialLineId}/tracking-links`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTrackingLinks(Array.isArray(data) ? data : []))
      .catch(() => setTrackingLinks([]));
  }, [materialLineId]);

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", currentDays.toString());
    params.delete("trackingLinkId");
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
    params.delete("trackingLinkId");
    router.push(`?${params.toString()}`);
  }, [currentDays, router, searchParams]);

  const handleTrackingLinkSelect = useCallback(
    (linkId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("days", currentDays.toString());
      if (!linkId) {
        params.delete("trackingLinkId");
        params.delete("utm_source");
        params.delete("utm_medium");
        params.delete("utm_campaign");
        router.push(`?${params.toString()}`);
        return;
      }
      const link = trackingLinks.find((l) => l.id === linkId);
      if (!link) return;
      params.set("trackingLinkId", link.id);
      if (link.utm_source) params.set("utm_source", link.utm_source);
      else params.delete("utm_source");
      if (link.utm_medium) params.set("utm_medium", link.utm_medium);
      else params.delete("utm_medium");
      if (link.utm_campaign) params.set("utm_campaign", link.utm_campaign);
      else params.delete("utm_campaign");
      router.push(`?${params.toString()}`);
    },
    [currentDays, trackingLinks, router, searchParams],
  );

  const hasFilters =
    (currentUtm.utm_source ?? "") ||
    (currentUtm.utm_medium ?? "") ||
    (currentUtm.utm_campaign ?? "");
  const hasTrackingLinkSelected = !!trackingLinkId;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {materialLineId && trackingLinks.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Tracking link:</span>
          <select
            value={trackingLinkId ?? ""}
            onChange={(e) => handleTrackingLinkSelect(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[180px]"
          >
            <option value="">None (manual UTM)</option>
            {trackingLinks.map((link) => (
              <option key={link.id} value={link.id}>
                {link.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-500">Segment by UTM:</span>
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="Source"
          disabled={hasTrackingLinkSelected}
          className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
        />
        <input
          type="text"
          value={medium}
          onChange={(e) => setMedium(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="Medium"
          disabled={hasTrackingLinkSelected}
          className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
        />
        <input
          type="text"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          placeholder="Campaign"
          disabled={hasTrackingLinkSelected}
          className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
        />
        <button
          type="button"
          onClick={applyFilters}
          disabled={hasTrackingLinkSelected}
          className="px-2 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50"
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
    </div>
  );
}
