import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const days = Math.max(1, Math.min(365, Number(sp.get("days") ?? 30)));
  const organizationId = sp.get("organizationId") || undefined;
  const materialLineId = sp.get("materialLineId") || undefined;
  const utmSource = sp.get("utm_source") || undefined;
  const utmMedium = sp.get("utm_medium") || undefined;
  const utmCampaign = sp.get("utm_campaign") || undefined;

  const supabase = await createServiceClient();
  const startDate = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  let materialLineIds: string[] = [];
  if (materialLineId) {
    materialLineIds = [materialLineId];
  } else if (organizationId) {
    const { data: lines } = await supabase
      .from("material_lines")
      .select("id")
      .eq("organization_id", organizationId);
    materialLineIds = (lines ?? []).map((r) => r.id as string);
  }

  let query = supabase
    .from("analytics_events")
    .select(
      "id, created_at, organization_id, material_line_id, metadata, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer",
    )
    .eq("event_type", "free_resource_email_sent")
    .not("metadata->>email", "is", null)
    .gte("created_at", startDate)
    .order("created_at", { ascending: false })
    .range(0, 9999);

  if (materialLineIds.length > 0) {
    query = query.in("material_line_id", materialLineIds);
  } else if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }
  if (utmSource) query = query.eq("utm_source", utmSource);
  if (utmMedium) query = query.eq("utm_medium", utmMedium);
  if (utmCampaign) query = query.eq("utm_campaign", utmCampaign);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch records", detail: error.message },
      { status: 500 },
    );
  }

  const rows = (data ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id as string,
      created_at: r.created_at as string,
      email: typeof meta.email === "string" ? meta.email : null,
      organization_id: r.organization_id as string | null,
      material_line_id: r.material_line_id as string | null,
      utm_source: r.utm_source as string | null,
      utm_medium: r.utm_medium as string | null,
      utm_campaign: r.utm_campaign as string | null,
      utm_term: r.utm_term as string | null,
      utm_content: r.utm_content as string | null,
      referrer: r.referrer as string | null,
    };
  });

  return NextResponse.json({ records: rows });
}
