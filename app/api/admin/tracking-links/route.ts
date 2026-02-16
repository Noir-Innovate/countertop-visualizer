import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";

export interface AdminTrackingLink {
  id: string;
  name: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  material_line_id: string;
  organization_id: string;
  material_line_name: string;
  organization_name: string;
}

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServiceClient();
  const { data: rows, error } = await supabase
    .from("tracking_links")
    .select(
      "id, name, utm_source, utm_medium, utm_campaign, utm_term, utm_content, material_line_id, material_lines(id, name, organization_id, organizations(id, name))",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch tracking links" },
      { status: 500 },
    );
  }

  const links: AdminTrackingLink[] = (rows ?? []).map(
    (r: Record<string, unknown>) => {
      const ml = r.material_lines as {
        id: string;
        name: string;
        organization_id: string;
        organizations: { id: string; name: string };
      } | null;
      return {
        id: r.id as string,
        name: r.name as string,
        utm_source: (r.utm_source as string | null) ?? null,
        utm_medium: (r.utm_medium as string | null) ?? null,
        utm_campaign: (r.utm_campaign as string | null) ?? null,
        utm_term: (r.utm_term as string | null) ?? null,
        utm_content: (r.utm_content as string | null) ?? null,
        material_line_id: r.material_line_id as string,
        organization_id: ml?.organization_id ?? "",
        material_line_name: ml?.name ?? "",
        organization_name: ml?.organizations?.name ?? "",
      };
    },
  );

  return NextResponse.json({ trackingLinks: links });
}
