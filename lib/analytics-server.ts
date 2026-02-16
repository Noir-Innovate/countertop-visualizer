/**
 * Server-side analytics: read event counts and event data from Supabase analytics_events.
 * Supports segmenting by UTM parameters.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface AnalyticsQueryParams {
  eventName: string;
  materialLineIds: string[];
  organizationId?: string;
  startDate?: Date;
  endDate?: Date;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role config");
  return createClient(url, key);
}

export async function getSupabaseEventCount(
  params: AnalyticsQueryParams,
): Promise<number> {
  const supabase = getServiceClient();

  let query = supabase
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", params.eventName);

  if (params.materialLineIds.length > 0) {
    query = query.in("material_line_id", params.materialLineIds);
  }
  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId);
  }
  if (params.startDate) {
    query = query.gte("created_at", params.startDate.toISOString());
  }
  if (params.endDate) {
    query = query.lte("created_at", params.endDate.toISOString());
  }
  if (params.utm_source != null && params.utm_source !== "") {
    query = query.eq("utm_source", params.utm_source);
  }
  if (params.utm_medium != null && params.utm_medium !== "") {
    query = query.eq("utm_medium", params.utm_medium);
  }
  if (params.utm_campaign != null && params.utm_campaign !== "") {
    query = query.eq("utm_campaign", params.utm_campaign);
  }

  const { count, error } = await query;

  if (error) {
    console.error("[analytics-server] getSupabaseEventCount error:", error);
    return 0;
  }
  return count ?? 0;
}

export async function getSupabaseEventCounts(
  params: AnalyticsQueryParams[],
): Promise<number[]> {
  return Promise.all(params.map((p) => getSupabaseEventCount(p)));
}

export interface SupabaseEventRow {
  timestamp: string;
  properties: Record<string, unknown>;
}

export interface SupabaseEventRowWithContext extends SupabaseEventRow {
  material_line_id: string | null;
  organization_id: string | null;
}

export async function getSupabaseEventData(
  params: AnalyticsQueryParams & { limit?: number; includeContext?: boolean },
): Promise<
  Array<
    | { timestamp: string; properties: Record<string, unknown> }
    | SupabaseEventRowWithContext
  >
> {
  const supabase = getServiceClient();
  const limit = params.limit ?? 100;
  const includeContext = params.includeContext === true;

  const selectFields = includeContext
    ? "created_at, metadata, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, tags, material_line_id, organization_id"
    : "created_at, metadata, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, tags";

  let query = supabase
    .from("analytics_events")
    .select(selectFields)
    .eq("event_type", params.eventName)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.materialLineIds.length > 0) {
    query = query.in("material_line_id", params.materialLineIds);
  }
  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId);
  }
  if (params.startDate) {
    query = query.gte("created_at", params.startDate.toISOString());
  }
  if (params.endDate) {
    query = query.lte("created_at", params.endDate.toISOString());
  }
  if (params.utm_source != null && params.utm_source !== "") {
    query = query.eq("utm_source", params.utm_source);
  }
  if (params.utm_medium != null && params.utm_medium !== "") {
    query = query.eq("utm_medium", params.utm_medium);
  }
  if (params.utm_campaign != null && params.utm_campaign !== "") {
    query = query.eq("utm_campaign", params.utm_campaign);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[analytics-server] getSupabaseEventData error:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const base = {
      timestamp: row.created_at,
      properties: {
        ...(row.metadata as Record<string, unknown>),
        utm_source: row.utm_source,
        utm_medium: row.utm_medium,
        utm_campaign: row.utm_campaign,
        utm_term: row.utm_term,
        utm_content: row.utm_content,
        referrer: row.referrer,
        tags: row.tags,
      },
    };
    if (
      includeContext &&
      "material_line_id" in row &&
      "organization_id" in row
    ) {
      return {
        ...base,
        material_line_id: row.material_line_id as string | null,
        organization_id: row.organization_id as string | null,
      } as SupabaseEventRowWithContext;
    }
    return base;
  });
}
