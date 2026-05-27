/**
 * Fire-and-forget analytics tracking to Supabase.
 * Never awaited so it does not block the UI.
 */

import { getStoredAttribution } from "./attribution";
import { getVisitorId } from "./visitor-id";

export function trackToSupabase(
  eventType: string,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;

  const attribution = getStoredAttribution();
  const materialLineId =
    (properties?.materialLineId as string) ??
    (properties?.material_line_id as string) ??
    null;
  const organizationId =
    (properties?.organizationId as string) ??
    (properties?.organization_id as string) ??
    null;

  const payload = {
    event_type: eventType,
    metadata: properties ?? {},
    material_line_id: materialLineId,
    organization_id: organizationId,
    // Anonymous visitor id — populated on every client event so we can
    // stitch pre-signup activity (landing page views, demo CTA clicks)
    // to the same person who later signs up and gets a profile_id.
    session_id: getVisitorId(),
    utm_source: attribution?.utm_source ?? null,
    utm_medium: attribution?.utm_medium ?? null,
    utm_campaign: attribution?.utm_campaign ?? null,
    utm_term: attribution?.utm_term ?? null,
    utm_content: attribution?.utm_content ?? null,
    referrer: attribution?.referrer ?? null,
    tags: attribution?.tags ?? {},
  };

  fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Fire-and-forget: ignore errors
  });
}
