import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAssignedLines } from "@/lib/sales/assignments";
import { getMaterialLineAccess } from "@/lib/admin-auth";
import SalesPortalShell from "./components/SalesPortalShell";
import type { MaterialLineConfig } from "@/lib/material-line";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ materialLineId: string }>;
}

export default async function SalesPortalPage({ params }: PageProps) {
  const { materialLineId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/dashboard/login?next=/sales/${materialLineId}`);

  const lines = await getAssignedLines(user.id);
  const active = lines.find((l) => l.id === materialLineId);
  if (!active) redirect("/sales");

  const service = await createServiceClient();
  const { data: kitchenImages } = await service
    .from("kitchen_images")
    .select("id, filename, title, order")
    .eq("material_line_id", active.id)
    .order("order", { ascending: true });

  const access = await getMaterialLineAccess(active.id);
  const isManager =
    access?.role === "super_admin" ||
    access?.role === "owner" ||
    access?.role === "admin";

  let jobsQuery = service
    .from("leads")
    .select(
      "id, name, email, phone, address, notes, gps_lat, gps_lng, created_at, selected_image_url, original_image_url, v2_session_id",
    )
    .eq("material_line_id", active.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!isManager) {
    jobsQuery = jobsQuery.eq("salesperson_id", user.id);
  }
  const { data: initialJobs } = await jobsQuery;

  const materialLine: MaterialLineConfig = {
    id: active.id,
    organizationId: active.organization_id,
    slug: active.slug,
    name: active.name,
    lineKind: active.line_kind,
    logoUrl: active.logo_url,
    primaryColor: active.primary_color,
    backgroundColor: active.background_color,
    supabaseFolder: active.supabase_folder,
    kitchenImages: kitchenImages || [],
  };

  return (
    <SalesPortalShell
      materialLine={materialLine}
      assignedLines={lines.map((l) => ({
        id: l.id,
        name: l.name,
        line_kind: l.line_kind,
        organization_name: l.organization_name,
      }))}
      initialJobs={initialJobs || []}
    />
  );
}
