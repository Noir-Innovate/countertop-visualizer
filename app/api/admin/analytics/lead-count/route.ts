import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const days = parseInt(searchParams.get("days") || "30", 10);
  const organizationId = searchParams.get("organizationId") || undefined;
  const materialLineId = searchParams.get("materialLineId") || undefined;

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const supabase = await createServiceClient();

  const { data, error } = await supabase.rpc("get_unique_lead_count", {
    p_start_date: startDate.toISOString(),
    p_material_line_id: materialLineId || null,
    p_organization_id: organizationId || null,
  });

  if (error) {
    console.error("[admin/lead-count] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch lead count" },
      { status: 500 },
    );
  }

  return NextResponse.json({ count: typeof data === "number" ? data : 0 });
}
