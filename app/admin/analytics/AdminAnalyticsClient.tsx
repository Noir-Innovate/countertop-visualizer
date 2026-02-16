"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  useAdminEventCount,
  type AdminEventCountFilters,
} from "./useAdminEventCount";

interface OrgOption {
  id: string;
  name: string;
  material_lines: Array<{ id: string; name: string; slug: string }>;
}

interface TrackingLinkOption {
  id: string;
  name: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  material_line_id: string;
  organization_id: string;
  material_line_name: string;
  organization_name: string;
}

function AdminTimeframeSelector({
  currentDays,
  onDaysChange,
}: {
  currentDays: number;
  onDaysChange: (days: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onDaysChange(d)}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
            currentDays === d
              ? "bg-blue-600 text-white"
              : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          {d} Days
        </button>
      ))}
    </div>
  );
}

function AdminUtmFilters({
  utm,
  onApply,
  onClear,
  disabled,
}: {
  utm: { utm_source?: string; utm_medium?: string; utm_campaign?: string };
  onApply: (v: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
  }) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [source, setSource] = useState(utm.utm_source ?? "");
  const [medium, setMedium] = useState(utm.utm_medium ?? "");
  const [campaign, setCampaign] = useState(utm.utm_campaign ?? "");
  const hasActive =
    (utm.utm_source ?? "") ||
    (utm.utm_medium ?? "") ||
    (utm.utm_campaign ?? "");

  useEffect(() => {
    setSource(utm.utm_source ?? "");
    setMedium(utm.utm_medium ?? "");
    setCampaign(utm.utm_campaign ?? "");
  }, [utm.utm_source, utm.utm_medium, utm.utm_campaign]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-slate-500">UTM:</span>
      <input
        type="text"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Source"
        disabled={disabled}
        className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      />
      <input
        type="text"
        value={medium}
        onChange={(e) => setMedium(e.target.value)}
        placeholder="Medium"
        disabled={disabled}
        className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      />
      <input
        type="text"
        value={campaign}
        onChange={(e) => setCampaign(e.target.value)}
        placeholder="Campaign"
        disabled={disabled}
        className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-500"
      />
      <button
        type="button"
        onClick={() =>
          onApply({
            utm_source: source.trim(),
            utm_medium: medium.trim(),
            utm_campaign: campaign.trim(),
          })
        }
        disabled={disabled}
        className="px-2 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 rounded disabled:opacity-50"
      >
        Apply
      </button>
      {hasActive && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="px-2 py-1.5 text-sm text-slate-600 disabled:opacity-50"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function StepCard({
  label,
  count,
  loading,
  description,
}: {
  label: string;
  count: number | null;
  loading: boolean;
  description: string;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-2xl font-bold text-slate-900">
          {loading ? "—" : (count ?? 0).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-slate-500">{description}</p>
    </div>
  );
}

function GeneralCard({
  label,
  count,
  loading,
  sublabel,
}: {
  label: string;
  count: number | null;
  loading: boolean;
  sublabel: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-slate-900">
        {loading ? "—" : (count ?? 0).toLocaleString()}
      </p>
      <p className="text-xs text-slate-400 mt-1">{sublabel}</p>
    </div>
  );
}

export default function AdminAnalyticsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const days = parseInt(searchParams.get("days") || "30", 10);
  const organizationId = searchParams.get("organizationId") || undefined;
  const materialLineId = searchParams.get("materialLineId") || undefined;
  const trackingLinkId = searchParams.get("trackingLinkId") || undefined;
  const utm_source = searchParams.get("utm_source") ?? undefined;
  const utm_medium = searchParams.get("utm_medium") ?? undefined;
  const utm_campaign = searchParams.get("utm_campaign") ?? undefined;

  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLinkOption[]>([]);
  const [events, setEvents] = useState<
    Array<{
      timestamp: string;
      properties: Record<string, unknown>;
      material_line_id?: string | null;
      organization_id?: string | null;
    }>
  >([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const filters: AdminEventCountFilters = {
    days,
    organizationId: organizationId || null,
    materialLineId: materialLineId || null,
    utm_source: utm_source ?? null,
    utm_medium: utm_medium ?? null,
    utm_campaign: utm_campaign ?? null,
  };

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setOrganizations(data?.organizations ?? []))
      .catch(() => setOrganizations([]));
  }, []);

  useEffect(() => {
    fetch("/api/admin/tracking-links")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTrackingLinks(data?.trackingLinks ?? []))
      .catch(() => setTrackingLinks([]));
  }, []);

  useEffect(() => {
    setEventsLoading(true);
    const params = new URLSearchParams();
    params.set("eventName", "page_view");
    params.set("days", days.toString());
    params.set("limit", "50");
    if (organizationId) params.set("organizationId", organizationId);
    if (materialLineId) params.set("materialLineId", materialLineId);
    if (utm_source) params.set("utm_source", utm_source);
    if (utm_medium) params.set("utm_medium", utm_medium);
    if (utm_campaign) params.set("utm_campaign", utm_campaign);
    fetch(`/api/admin/analytics/events?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [
    days,
    organizationId,
    materialLineId,
    utm_source,
    utm_medium,
    utm_campaign,
  ]);

  const updateParams = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v === undefined || v === "") params.delete(k);
        else params.set(k, String(v));
      });
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleTrackingLinkSelect = useCallback(
    (linkId: string) => {
      if (!linkId) {
        updateParams({
          trackingLinkId: undefined,
          utm_source: undefined,
          utm_medium: undefined,
          utm_campaign: undefined,
          organizationId: undefined,
          materialLineId: undefined,
        });
        return;
      }
      const link = trackingLinks.find((l) => l.id === linkId);
      if (!link) return;
      updateParams({
        trackingLinkId: link.id,
        utm_source: link.utm_source ?? undefined,
        utm_medium: link.utm_medium ?? undefined,
        utm_campaign: link.utm_campaign ?? undefined,
        organizationId: link.organization_id || undefined,
        materialLineId: link.material_line_id || undefined,
      });
    },
    [trackingLinks, updateParams],
  );

  const materialLinesForSelect = organizationId
    ? (organizations.find((o) => o.id === organizationId)?.material_lines ?? [])
    : organizations.flatMap((o) => o.material_lines);

  // General
  const pageViews = useAdminEventCount("page_view", filters);
  const quoteSubmitted = useAdminEventCount("quote_submitted", filters);
  const imageUploaded = useAdminEventCount("image_uploaded", filters);
  const imageSelected = useAdminEventCount("image_selected", filters);
  const step1Total = (imageUploaded.count ?? 0) + (imageSelected.count ?? 0);
  const conversionRate =
    step1Total > 0
      ? (((quoteSubmitted.count ?? 0) / step1Total) * 100).toFixed(1)
      : "0.0";

  // Step 1
  const slabSelected = useAdminEventCount("slab_selected", filters);
  const generationStarted = useAdminEventCount("generation_started", filters);
  const backPressed = useAdminEventCount("back_pressed", filters);
  // Step 3
  const sawIt = useAdminEventCount("saw_it", filters);
  const viewModeChanged = useAdminEventCount("view_mode_changed", filters);
  const materialViewed = useAdminEventCount("material_viewed", filters);
  const leadFormSubmitted = useAdminEventCount("lead_form_submitted", filters);
  const verificationSuccessful = useAdminEventCount(
    "verification_successful",
    filters,
  );

  const orgName = (id: string) =>
    organizations.find((o) => o.id === id)?.name ?? id.slice(0, 8);
  const lineName = (id: string) => {
    for (const o of organizations) {
      const line = o.material_lines.find((l) => l.id === id);
      if (line) return line.name;
    }
    return id.slice(0, 8);
  };

  const hasTrackingLinkSelected = !!trackingLinkId;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Admin Analytics</h1>
        <p className="text-slate-600 mt-1">
          All events across organizations. Use filters to segment.
        </p>
      </div>

      <div className="mb-6 p-4 bg-white rounded-xl border border-slate-200 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Timeframe:</span>
            <AdminTimeframeSelector
              currentDays={days}
              onDaysChange={(d) => updateParams({ days: d })}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Tracking link:</label>
            <select
              value={trackingLinkId ?? ""}
              onChange={(e) => handleTrackingLinkSelect(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[220px]"
            >
              <option value="">None (manual UTM)</option>
              {trackingLinks.map((link) => (
                <option key={link.id} value={link.id}>
                  {link.name} · {link.material_line_name} ·{" "}
                  {link.organization_name}
                </option>
              ))}
            </select>
          </div>
          <AdminUtmFilters
            utm={{ utm_source, utm_medium, utm_campaign }}
            onApply={(v) =>
              updateParams({
                utm_source: v.utm_source || undefined,
                utm_medium: v.utm_medium || undefined,
                utm_campaign: v.utm_campaign || undefined,
                trackingLinkId: undefined,
              })
            }
            onClear={() =>
              updateParams({
                utm_source: undefined,
                utm_medium: undefined,
                utm_campaign: undefined,
                trackingLinkId: undefined,
              })
            }
            disabled={hasTrackingLinkSelected}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Organization:</label>
            <select
              value={organizationId ?? ""}
              onChange={(e) =>
                updateParams({
                  organizationId: e.target.value || undefined,
                  materialLineId: undefined,
                  trackingLinkId: undefined,
                })
              }
              className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[180px]"
            >
              <option value="">All</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Material line:</label>
            <select
              value={materialLineId ?? ""}
              onChange={(e) =>
                updateParams({
                  materialLineId: e.target.value || undefined,
                  trackingLinkId: undefined,
                })
              }
              className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[180px]"
            >
              <option value="">All</option>
              {materialLinesForSelect.map((ml) => (
                <option key={ml.id} value={ml.id}>
                  {ml.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* General Analytics */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          General Analytics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GeneralCard
            label="Page Views"
            count={pageViews.count}
            loading={pageViews.loading}
            sublabel="Total visits to the visualizer"
          />
          <GeneralCard
            label="Total Conversions"
            count={quoteSubmitted.count}
            loading={quoteSubmitted.loading}
            sublabel="Quote requests"
          />
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <p className="text-sm text-slate-500 mb-1">
              Overall Conversion Rate
            </p>
            <p className="text-3xl font-bold text-slate-900">
              {pageViews.loading ||
              quoteSubmitted.loading ||
              imageUploaded.loading ||
              imageSelected.loading
                ? "—"
                : `${conversionRate}%`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              From image selection to quote
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Image Upload & Selection */}
      <div className="mb-6">
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
            <StepCard
              label="Image Uploaded"
              count={imageUploaded.count}
              loading={imageUploaded.loading}
              description="Users uploaded their own image"
            />
            <StepCard
              label="Image Selected"
              count={imageSelected.count}
              loading={imageSelected.loading}
              description="Users selected an example kitchen image"
            />
          </div>
        </div>
      </div>

      {/* Step 2: Material Selection & Generation */}
      <div className="mb-6">
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
            <StepCard
              label="Material Selected"
              count={slabSelected.count}
              loading={slabSelected.loading}
              description="Materials selected (includes name & type)"
            />
            <StepCard
              label="See It Pressed"
              count={generationStarted.count}
              loading={generationStarted.loading}
              description='Users clicked "See It" to generate'
            />
            <StepCard
              label="Back Pressed"
              count={backPressed.count}
              loading={backPressed.loading}
              description="Users went back (from Step 2 or 3)"
            />
          </div>
        </div>
      </div>

      {/* Step 3: Results Viewing & Quote Submission */}
      <div className="mb-8">
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
            <StepCard
              label="Saw It"
              count={sawIt.count}
              loading={sawIt.loading}
              description="Images finished loading & user stayed"
            />
            <StepCard
              label="View Mode Changed"
              count={viewModeChanged.count}
              loading={viewModeChanged.loading}
              description="Switched between Carousel/Compare"
            />
            <StepCard
              label="Materials Viewed"
              count={materialViewed.count}
              loading={materialViewed.loading}
              description="Users viewed specific materials"
            />
            <StepCard
              label="Get Quote Pressed"
              count={leadFormSubmitted.count}
              loading={leadFormSubmitted.loading}
              description='Users clicked "Get Quote"'
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StepCard
              label="Phone Verified"
              count={verificationSuccessful.count}
              loading={verificationSuccessful.loading}
              description="Phone numbers successfully verified"
            />
            <StepCard
              label="Quote Submitted"
              count={quoteSubmitted.count}
              loading={quoteSubmitted.loading}
              description="Quote requests submitted (includes material name & zip)"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <h2 className="text-lg font-semibold text-slate-900 p-4 border-b border-slate-200">
          Recent page_view events (sample)
        </h2>
        {eventsLoading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No events match filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left p-3 font-medium text-slate-700">
                    Time
                  </th>
                  <th className="text-left p-3 font-medium text-slate-700">
                    Organization
                  </th>
                  <th className="text-left p-3 font-medium text-slate-700">
                    Material line
                  </th>
                  <th className="text-left p-3 font-medium text-slate-700">
                    UTM / metadata
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-3 text-slate-600">
                      {ev.timestamp
                        ? new Date(ev.timestamp).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-3">
                      {"organization_id" in ev && ev.organization_id
                        ? orgName(ev.organization_id)
                        : "—"}
                    </td>
                    <td className="p-3">
                      {"material_line_id" in ev && ev.material_line_id
                        ? lineName(ev.material_line_id)
                        : "—"}
                    </td>
                    <td className="p-3 text-slate-600 max-w-xs truncate">
                      {ev.properties && typeof ev.properties === "object"
                        ? JSON.stringify(ev.properties).slice(0, 80) +
                          (JSON.stringify(ev.properties).length > 80 ? "…" : "")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
