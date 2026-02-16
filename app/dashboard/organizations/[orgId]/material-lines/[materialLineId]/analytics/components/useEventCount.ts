"use client";

import { useEffect, useState, useRef } from "react";

// Client-side cache to avoid refetching the same data
const cache = new Map<string, { count: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

export interface EventCountUtmFilters {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

function getCacheKey(
  eventName: string,
  materialLineId: string,
  days: number,
  utm?: EventCountUtmFilters | null,
): string {
  const u = utm
    ? `${utm.utm_source ?? ""}-${utm.utm_medium ?? ""}-${utm.utm_campaign ?? ""}`
    : "";
  return `${eventName}-${materialLineId}-${days}-${u}`;
}

function getCachedCount(
  eventName: string,
  materialLineId: string,
  days: number,
  utm?: EventCountUtmFilters | null,
): number | null {
  const key = getCacheKey(eventName, materialLineId, days, utm);
  const cached = cache.get(key);

  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_TTL) {
      return cached.count;
    } else {
      // Expired, remove from cache
      cache.delete(key);
    }
  }

  return null;
}

function setCachedCount(
  eventName: string,
  materialLineId: string,
  days: number,
  count: number,
  utm?: EventCountUtmFilters | null,
): void {
  const key = getCacheKey(eventName, materialLineId, days, utm);
  cache.set(key, { count, timestamp: Date.now() });
}

export function useEventCount(
  eventName: string,
  materialLineId: string,
  days: number,
  forceRefresh = false,
  utm?: EventCountUtmFilters | null,
) {
  const [count, setCount] = useState<number | null>(() => {
    if (!forceRefresh) {
      return getCachedCount(eventName, materialLineId, days, utm);
    }
    return null;
  });
  const [loading, setLoading] = useState(count === null);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      if (fetchingRef.current) {
        return;
      }

      if (!forceRefresh) {
        const cached = getCachedCount(eventName, materialLineId, days, utm);
        if (cached !== null) {
          if (!cancelled) {
            setCount(cached);
            setLoading(false);
          }
          return;
        }
      }

      fetchingRef.current = true;

      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          eventName,
          materialLineId,
          days: days.toString(),
          ...(forceRefresh && { forceRefresh: "true" }),
        });
        if (utm?.utm_source) params.set("utm_source", utm.utm_source);
        if (utm?.utm_medium) params.set("utm_medium", utm.utm_medium);
        if (utm?.utm_campaign) params.set("utm_campaign", utm.utm_campaign);

        const response = await fetch(`/api/analytics/event-count?${params}`, {
          // Use browser cache if available
          cache: forceRefresh ? "no-store" : "default",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }

        const data = await response.json();

        if (!cancelled) {
          const fetchedCount = data.count || 0;
          setCount(fetchedCount);
          setLoading(false);
          setCachedCount(eventName, materialLineId, days, fetchedCount, utm);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setCount(0);
          setLoading(false);
        }
      } finally {
        fetchingRef.current = false;
      }
    }

    fetchCount();

    return () => {
      cancelled = true;
    };
  }, [
    eventName,
    materialLineId,
    days,
    forceRefresh,
    utm?.utm_source,
    utm?.utm_medium,
    utm?.utm_campaign,
  ]);

  return { count, loading, error };
}
