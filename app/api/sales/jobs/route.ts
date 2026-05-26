import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { pushLeadToGhl } from "@/lib/integrations/push-lead-to-ghl";

interface CreateJobBody {
  materialLineId: string;
  address: string;
  customerName?: string;
  email?: string;
  phone?: string;
  notes?: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateJobBody;
  try {
    body = (await request.json()) as CreateJobBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.materialLineId || !body.address?.trim()) {
    return NextResponse.json(
      { error: "materialLineId and address are required" },
      { status: 400 },
    );
  }

  // Verify the salesperson is assigned to this line and look up the org.
  const { data: assignment } = await supabase
    .from("salesperson_line_assignments")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("material_line_id", body.materialLineId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json(
      { error: "You are not assigned to this material line" },
      { status: 403 },
    );
  }

  const service = await createServiceClient();
  const { data: lead, error: insertError } = await service
    .from("leads")
    .insert({
      name: body.customerName?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      address: body.address.trim(),
      notes: body.notes?.trim() || null,
      gps_lat: body.gpsLat ?? null,
      gps_lng: body.gpsLng ?? null,
      salesperson_id: user.id,
      source: "salesperson",
      material_line_id: body.materialLineId,
      organization_id: assignment.organization_id,
    })
    .select()
    .single();

  if (insertError || !lead) {
    console.error("[sales/jobs] insert failed:", insertError);
    return NextResponse.json(
      { error: insertError?.message || "Failed to create job" },
      { status: 500 },
    );
  }

  // Atomic-ish: also create the default Kitchen workspace right away so the
  // client lands on Stage 1 of a real workspace, not an empty home screen.
  const workspaceSessionId = randomUUID();
  const { data: ws, error: wsError } = await service
    .from("job_workspaces")
    .insert({
      lead_id: lead.id,
      session_id: workspaceSessionId,
      label: "Kitchen",
      kitchen_image_path: null,
    })
    .select("id, session_id, label, kitchen_image_path, created_at")
    .single();

  if (wsError || !ws) {
    console.error("[sales/jobs] default workspace insert failed:", wsError);
    // Don't fail the request — the client can still create one manually.
  }

  // Best-effort GHL push. Errors don't fail the request.
  try {
    const result = await pushLeadToGhl({ supabase: service, leadId: lead.id });
    if (!result.pushed) {
      console.log("[sales/jobs][ghl] skipped:", result.reason);
    }
  } catch (e) {
    console.error("[sales/jobs][ghl] push failed:", e);
  }

  return NextResponse.json(
    {
      job: lead,
      workspace: ws
        ? {
            id: ws.id,
            sessionId: ws.session_id,
            label: ws.label,
            kitchenImagePath: ws.kitchen_image_path,
            kitchenImageUrl: null,
            createdAt: ws.created_at,
            generations: [],
          }
        : null,
    },
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const materialLineId = searchParams.get("materialLineId");
  const search = searchParams.get("q")?.trim() || "";
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

  if (!materialLineId) {
    return NextResponse.json(
      { error: "materialLineId is required" },
      { status: 400 },
    );
  }

  const { data: assignment } = await supabase
    .from("salesperson_line_assignments")
    .select("id")
    .eq("profile_id", user.id)
    .eq("material_line_id", materialLineId)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json(
      { error: "You are not assigned to this material line" },
      { status: 403 },
    );
  }

  let query = supabase
    .from("leads")
    .select(
      "id, name, email, phone, address, notes, gps_lat, gps_lng, created_at, selected_image_url, original_image_url, v2_session_id",
    )
    .eq("salesperson_id", user.id)
    .eq("material_line_id", materialLineId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    const escaped = search.replace(/[%,]/g, " ");
    query = query.or(
      `address.ilike.%${escaped}%,name.ilike.%${escaped}%,email.ilike.%${escaped}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[sales/jobs] list failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data || [] });
}
