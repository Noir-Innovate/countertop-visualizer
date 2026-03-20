import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getMaterialLineAccess } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const materialLineId = searchParams.get("materialLineId");
    const days = parseInt(searchParams.get("days") || "30", 10);

    if (!materialLineId) {
      return NextResponse.json(
        { error: "materialLineId is required" },
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

    const service = await createServiceClient();
    const { data, error } = await service.rpc("get_unique_lead_count", {
      p_start_date: startDate.toISOString(),
      p_material_line_id: materialLineId,
      p_organization_id: null,
    });

    if (error) {
      console.error("[analytics/lead-count] error:", error);
      return NextResponse.json(
        { error: "Failed to fetch lead count" },
        { status: 500 },
      );
    }

    return NextResponse.json({ count: typeof data === "number" ? data : 0 });
  } catch (error) {
    console.error("Error fetching lead count:", error);
    return NextResponse.json(
      { error: "Failed to fetch lead count" },
      { status: 500 },
    );
  }
}
