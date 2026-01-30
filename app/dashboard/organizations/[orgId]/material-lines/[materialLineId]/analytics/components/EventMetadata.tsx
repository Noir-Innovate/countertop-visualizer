"use client";

import { useState, useMemo, useEffect } from "react";

interface EventMetadataProps {
  eventName: string;
  eventCount: number;
  materialLineId: string;
  days: number;
}

export default function EventMetadata({
  eventName,
  eventCount,
  materialLineId,
  days,
}: EventMetadataProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [metadata, setMetadata] = useState<
    Array<{ timestamp: string; properties: Record<string, unknown> }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cachedDays, setCachedDays] = useState<number>(days);

  // Clear metadata cache when timeframe changes
  useEffect(() => {
    if (cachedDays !== days) {
      setMetadata([]);
      setCachedDays(days);
      setIsModalOpen(false);
    }
  }, [days, cachedDays]);

  // Determine which field to extract based on event name
  const getFieldName = () => {
    if (eventName === "quote_submitted") {
      return "selectedSlab";
    }
    if (eventName === "slab_selected") {
      return "slabName";
    }
    if (eventName === "page_view") {
      return "$geoip_postal_code";
    }
    return null;
  };

  // Aggregate counts for discrete values
  const aggregatedCounts = useMemo(() => {
    const fieldName = getFieldName();
    if (!fieldName || metadata.length === 0) {
      return [];
    }

    const counts: Record<string, number> = {};
    metadata.forEach((event) => {
      const value = event.properties[fieldName];
      if (value !== null && value !== undefined && value !== "") {
        const key = String(value);
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    // Convert to array and sort by count descending
    return Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }, [metadata, eventName]);

  const openModal = async () => {
    if (metadata.length > 0) {
      setIsModalOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/analytics/events?eventName=${encodeURIComponent(
          eventName,
        )}&materialLineId=${materialLineId}&days=${days}`,
      );
      const data = await response.json();
      setMetadata(data.events || []);
      setIsModalOpen(true);
    } catch (error) {
      console.error("Failed to fetch metadata:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  if (eventCount === 0) {
    return null;
  }

  const fieldName = getFieldName();
  const hasAggregation = fieldName !== null;

  return (
    <>
      <button
        onClick={openModal}
        disabled={isLoading}
        className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-2"
      >
        {isLoading ? (
          <span className="flex items-center gap-1">
            <svg
              className="animate-spin h-3 w-3"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Loading...
          </span>
        ) : (
          `View metadata (${eventCount} events)`
        )}
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          aria-labelledby="modal-title"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity"
            onClick={closeModal}
          ></div>

          {/* Modal container */}
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl">
              {/* Header */}
              <div className="bg-white px-6 py-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <h3
                    className="text-lg font-semibold text-slate-900"
                    id="modal-title"
                  >
                    Event Metadata: {eventName}
                  </h3>
                  <button
                    onClick={closeModal}
                    className="text-slate-400 hover:text-slate-500 transition-colors"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {eventCount} total event{eventCount !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Content */}
              <div className="bg-white px-6 py-4 max-h-[70vh] overflow-y-auto">
                {metadata.length > 0 ? (
                  hasAggregation && aggregatedCounts.length > 0 ? (
                    // Show aggregated counts
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-4">
                        Counts by{" "}
                        {fieldName === "$geoip_postal_code"
                          ? "Zip Code"
                          : fieldName === "selectedSlab"
                            ? "Material"
                            : "Material Name"}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                                {fieldName === "$geoip_postal_code"
                                  ? "Zip Code"
                                  : fieldName === "selectedSlab"
                                    ? "Material"
                                    : "Material Name"}
                              </th>
                              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                                Count
                              </th>
                              <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                                Percentage
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {aggregatedCounts.map((item, idx) => {
                              const percentage = (
                                (item.count / metadata.length) *
                                100
                              ).toFixed(1);
                              return (
                                <tr
                                  key={idx}
                                  className="border-b border-slate-100 hover:bg-slate-50"
                                >
                                  <td className="py-3 px-4 text-sm text-slate-900">
                                    {item.value || "(unknown)"}
                                  </td>
                                  <td className="py-3 px-4 text-sm text-slate-900 text-right font-medium">
                                    {item.count.toLocaleString()}
                                  </td>
                                  <td className="py-3 px-4 text-sm text-slate-500 text-right">
                                    {percentage}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    // Fallback to raw JSON if no aggregation field or no data
                    <div className="space-y-4">
                      {metadata.slice(0, 50).map((event, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-50 rounded-lg p-4 border border-slate-200"
                        >
                          <div className="text-xs font-medium text-slate-700 mb-2">
                            {new Date(event.timestamp).toLocaleString()}
                          </div>
                          <pre className="text-xs overflow-x-auto bg-white rounded p-3 border border-slate-200">
                            {JSON.stringify(event.properties, null, 2)}
                          </pre>
                        </div>
                      ))}
                      {metadata.length > 50 && (
                        <p className="text-sm text-slate-500 text-center py-2">
                          Showing first 50 of {metadata.length} events
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-500">No event data available</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 bg-slate-600 text-white font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
