"use client";

import { useEffect, useState, useRef } from "react";

export interface AdminEventCountFilters {
  days: number;
  organizationId?: string | null;
  materialLineId?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

function buildQuery(
  eventName: string,
  filters: AdminEventCountFilters,
): string {
  const params = new URLSearchParams();
  params.set("eventName", eventName);
  params.set("days", filters.days.toString());
  if (filters.organizationId)
    params.set("organizationId", filters.organizationId);
  if (filters.materialLineId)
    params.set("materialLineId", filters.materialLineId);
  if (filters.utm_source) params.set("utm_source", filters.utm_source);
  if (filters.utm_medium) params.set("utm_medium", filters.utm_medium);
  if (filters.utm_campaign) params.set("utm_campaign", filters.utm_campaign);
  return params.toString();
}

export function useAdminEventCount(
  eventName: string,
  filters: AdminEventCountFilters,
) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    const q = buildQuery(eventName, filters);
    fetch(`/api/admin/analytics/event-count?${q}`, {
      signal: abortRef.current.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data) => {
        setCount(typeof data.count === "number" ? data.count : 0);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setCount(0);
      })
      .finally(() => setLoading(false));

    return () => {
      abortRef.current?.abort();
    };
  }, [
    eventName,
    filters.days,
    filters.organizationId,
    filters.materialLineId,
    filters.utm_source,
    filters.utm_medium,
    filters.utm_campaign,
  ]);

  return { count, loading };
}
