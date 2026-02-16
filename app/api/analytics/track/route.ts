import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Public track endpoint. Inserts into analytics_events (Supabase).
 * Call this without awaiting so tracking is fire-and-forget.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType =
      typeof body.event_type === "string" ? body.event_type.trim() : null;
    if (!eventType) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 },
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const supabase = createClient(url, key);

    const metadata =
      body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const materialLineId = body.material_line_id ?? body.materialLineId ?? null;
    const organizationId = body.organization_id ?? body.organizationId ?? null;
    const sessionId = body.session_id ?? body.sessionId ?? null;

    const tags =
      body.tags && typeof body.tags === "object" && !Array.isArray(body.tags)
        ? body.tags
        : {};

    await supabase.from("analytics_events").insert({
      event_type: eventType,
      metadata,
      session_id: sessionId || null,
      material_line_id: materialLineId || null,
      organization_id: organizationId || null,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_term: body.utm_term ?? null,
      utm_content: body.utm_content ?? null,
      referrer: body.referrer ?? null,
      tags: Object.keys(tags).length > 0 ? tags : {},
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[analytics/track]", err);
    return NextResponse.json(
      { error: "Failed to track event" },
      { status: 500 },
    );
  }
}
