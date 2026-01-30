import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostHogEventData } from "@/lib/posthog-server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventName = searchParams.get("eventName");
    const materialLineId = searchParams.get("materialLineId");
    const days = parseInt(searchParams.get("days") || "30", 10);

    if (!eventName || !materialLineId) {
      return NextResponse.json(
        { error: "eventName and materialLineId are required" },
        { status: 400 },
      );
    }

    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this material line
    const { data: materialLine } = await supabase
      .from("material_lines")
      .select("organization_id")
      .eq("id", materialLineId)
      .single();

    if (!materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 },
      );
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Fetch event data
    const events = await getPostHogEventData({
      eventName,
      materialLineIds: [materialLineId],
      startDate,
      limit: 100,
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
