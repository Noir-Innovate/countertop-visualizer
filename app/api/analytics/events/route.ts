import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEventData } from "@/lib/analytics-server";
import { getMaterialLineAccess } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventName = searchParams.get("eventName");
    const materialLineId = searchParams.get("materialLineId");
    const days = parseInt(searchParams.get("days") || "30", 10);
    const utmSource = searchParams.get("utm_source");
    const utmMedium = searchParams.get("utm_medium");
    const utmCampaign = searchParams.get("utm_campaign");

    if (!eventName || !materialLineId) {
      return NextResponse.json(
        { error: "eventName and materialLineId are required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await getMaterialLineAccess(materialLineId);
    if (!access?.allowed) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const events = await getSupabaseEventData({
      eventName,
      materialLineIds: [materialLineId],
      startDate,
      limit: 100,
      utm_source: utmSource ?? undefined,
      utm_medium: utmMedium ?? undefined,
      utm_campaign: utmCampaign ?? undefined,
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching event metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch event metadata" },
      { status: 500 },
    );
  }
}
