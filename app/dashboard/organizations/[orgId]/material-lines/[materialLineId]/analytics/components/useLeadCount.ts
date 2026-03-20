"use client";

import { useEffect, useState, useRef } from "react";

export function useLeadCount(materialLineId: string, days: number) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      materialLineId,
      days: days.toString(),
    });

    fetch(`/api/analytics/lead-count?${params}`, {
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
        if (err.name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Unknown error");
          setCount(0);
        }
      })
      .finally(() => setLoading(false));

    return () => {
      abortRef.current?.abort();
    };
  }, [materialLineId, days]);

  return { count, loading, error };
}
