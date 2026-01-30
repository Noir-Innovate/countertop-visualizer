"use client";

import { useEffect, useState, useRef } from "react";

// Client-side cache to avoid refetching the same data
const cache = new Map<string, { count: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

function getCacheKey(
  eventName: string,
  materialLineId: string,
  days: number,
): string {
  return `${eventName}-${materialLineId}-${days}`;
}

function getCachedCount(
  eventName: string,
  materialLineId: string,
  days: number,
): number | null {
  const key = getCacheKey(eventName, materialLineId, days);
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
): void {
  const key = getCacheKey(eventName, materialLineId, days);
  cache.set(key, { count, timestamp: Date.now() });
}

export function useEventCount(
  eventName: string,
  materialLineId: string,
  days: number,
  forceRefresh = false,
) {
  const [count, setCount] = useState<number | null>(() => {
    // Check cache on initial render
    if (!forceRefresh) {
      return getCachedCount(eventName, materialLineId, days);
    }
    return null;
  });
  const [loading, setLoading] = useState(count === null);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      // Prevent duplicate requests
      if (fetchingRef.current) {
        return;
      }

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedCount(eventName, materialLineId, days);
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
          // Cache the result
          setCachedCount(eventName, materialLineId, days, fetchedCount);
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
  }, [eventName, materialLineId, days, forceRefresh]);

  return { count, loading, error };
}
