import { createClient } from "@/lib/supabase/client";

export type EventType =
  | "page_view"
  | "slab_selected"
  | "generation_started"
  | "quote_submitted";

interface TrackEventParams {
  materialLineId?: string | null;
  organizationId?: string | null;
  eventType: EventType;
  metadata?: Record<string, unknown>;
  sessionId?: string;
}

// Generate a session ID for anonymous visitor tracking
export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") {
    return "server-" + Math.random().toString(36).substring(2, 15);
  }

  const storageKey = "countertop_session_id";
  let sessionId = sessionStorage.getItem(storageKey);

  if (!sessionId) {
    sessionId =
      "session-" +
      Math.random().toString(36).substring(2, 15) +
      "-" +
      Date.now().toString(36);
    sessionStorage.setItem(storageKey, sessionId);
  }

  return sessionId;
}

// Normalize ID values - convert "default" or invalid values to null
function normalizeId(id: string | null | undefined): string | null {
  if (!id || id === "default" || id.trim() === "") {
    return null;
  }
  // Basic UUID format check (8-4-4-4-12 hex characters)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    // If it's not a valid UUID format, return null
    return null;
  }
  return id;
}

// Track an analytics event
export async function trackEvent({
  materialLineId,
  organizationId,
  eventType,
  metadata = {},
  sessionId,
}: TrackEventParams): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();

    // Normalize IDs to ensure they're valid UUIDs or null
    const normalizedMaterialLineId = normalizeId(materialLineId);
    const normalizedOrganizationId = normalizeId(organizationId);

    const { error } = await supabase.from("analytics_events").insert({
      material_line_id: normalizedMaterialLineId,
      organization_id: normalizedOrganizationId,
      event_type: eventType,
      metadata,
      session_id: sessionId || getOrCreateSessionId(),
    });

    if (error) {
      console.error("[Analytics] Failed to track event:", error);
      return { success: false, error: error.message };
    }

    console.log("[Analytics] Event tracked:", eventType, metadata);
    return { success: true };
  } catch (error) {
    console.error("[Analytics] Error:", error);
    return { success: false, error: "Failed to track event" };
  }
}

// Convenience functions for common events
export async function trackPageView(
  materialLineId?: string | null,
  organizationId?: string | null,
  metadata?: Record<string, unknown>
) {
  return trackEvent({
    materialLineId,
    organizationId,
    eventType: "page_view",
    metadata: {
      ...metadata,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      referrer: typeof window !== "undefined" ? document.referrer : undefined,
      userAgent:
        typeof window !== "undefined" ? navigator.userAgent : undefined,
    },
  });
}

export async function trackSlabSelected(
  slabId: string,
  slabName: string,
  materialLineId?: string | null,
  organizationId?: string | null
) {
  return trackEvent({
    materialLineId,
    organizationId,
    eventType: "slab_selected",
    metadata: { slabId, slabName },
  });
}

export async function trackGenerationStarted(
  slabCount: number,
  slabIds: string[],
  materialLineId?: string | null,
  organizationId?: string | null
) {
  return trackEvent({
    materialLineId,
    organizationId,
    eventType: "generation_started",
    metadata: { slabCount, slabIds },
  });
}

export async function trackQuoteSubmitted(
  leadData: { name: string; email: string; selectedSlab?: string },
  materialLineId?: string | null,
  organizationId?: string | null
) {
  return trackEvent({
    materialLineId,
    organizationId,
    eventType: "quote_submitted",
    metadata: leadData,
  });
}
