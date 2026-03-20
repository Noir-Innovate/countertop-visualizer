"use client";

import { useEffect, useState, useRef } from "react";

export interface AdminLeadCountFilters {
  days: number;
  organizationId?: string | null;
  materialLineId?: string | null;
}

function buildQuery(filters: AdminLeadCountFilters): string {
  const params = new URLSearchParams();
  params.set("days", filters.days.toString());
  if (filters.organizationId)
    params.set("organizationId", filters.organizationId);
  if (filters.materialLineId)
    params.set("materialLineId", filters.materialLineId);
  return params.toString();
}

export function useAdminLeadCount(filters: AdminLeadCountFilters) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    const q = buildQuery(filters);
    fetch(`/api/admin/analytics/lead-count?${q}`, {
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
  }, [filters.days, filters.organizationId, filters.materialLineId]);

  return { count, loading };
}
