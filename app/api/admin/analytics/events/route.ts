import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { getSupabaseEventData } from "@/lib/analytics-server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const eventName = searchParams.get("eventName");
  const days = parseInt(searchParams.get("days") || "30", 10);
  const organizationId = searchParams.get("organizationId") || undefined;
  const materialLineId = searchParams.get("materialLineId") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
  const utmSource = searchParams.get("utm_source") ?? undefined;
  const utmMedium = searchParams.get("utm_medium") ?? undefined;
  const utmCampaign = searchParams.get("utm_campaign") ?? undefined;

  if (!eventName) {
    return NextResponse.json(
      { error: "eventName is required" },
      { status: 400 },
    );
  }

  let materialLineIds: string[] = [];
  if (materialLineId) {
    materialLineIds = [materialLineId];
  } else if (organizationId) {
    const supabase = await createServiceClient();
    const { data: lines } = await supabase
      .from("material_lines")
      .select("id")
      .eq("organization_id", organizationId);
    materialLineIds = (lines ?? []).map((r) => r.id);
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const events = await getSupabaseEventData({
    eventName,
    materialLineIds,
    organizationId: materialLineIds.length === 0 ? organizationId : undefined,
    startDate,
    endDate: now,
    limit,
    includeContext: true,
    utm_source: utmSource ?? null,
    utm_medium: utmMedium ?? null,
    utm_campaign: utmCampaign ?? null,
  });

  return NextResponse.json({ events });
}
