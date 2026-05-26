import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface PatchBody {
  address?: string;
  customerName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Confirm the salesperson owns this job before mutating.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, salesperson_id")
    .eq("id", id)
    .maybeSingle();
  if (!lead || lead.salesperson_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, string | number | null> = {};
  if (body.address !== undefined) {
    const trimmed = body.address.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "Address cannot be empty" },
        { status: 400 },
      );
    }
    updates.address = trimmed;
  }
  if (body.customerName !== undefined)
    updates.name = body.customerName?.trim() || null;
  if (body.email !== undefined) updates.email = body.email?.trim() || null;
  if (body.phone !== undefined) updates.phone = body.phone?.trim() || null;
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
  if (body.gpsLat !== undefined) updates.gps_lat = body.gpsLat;
  if (body.gpsLng !== undefined) updates.gps_lng = body.gpsLng;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // RLS UPDATE policy allows salesperson_id = auth.uid(). Use the user client
  // so the policy applies cleanly.
  const service = await createServiceClient();
  const { data: updated, error } = await service
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select(
      "id, name, email, phone, address, notes, gps_lat, gps_lng, created_at, selected_image_url, original_image_url, v2_session_id",
    )
    .single();

  if (error || !updated) {
    console.error("[sales/jobs PATCH] failed:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update job" },
      { status: 500 },
    );
  }

  return NextResponse.json({ job: updated });
}
