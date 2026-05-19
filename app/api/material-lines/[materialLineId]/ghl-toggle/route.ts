import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ materialLineId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { materialLineId } = await params;
  const { enabled } = (await request.json()) as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled (boolean) required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: line } = await service
    .from("material_lines")
    .select("id, organization_id")
    .eq("id", materialLineId)
    .single();
  if (!line) {
    return NextResponse.json(
      { error: "Material line not found" },
      { status: 404 },
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", line.organization_id)
    .single();
  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    return NextResponse.json(
      { error: "Org admin role required" },
      { status: 403 },
    );
  }

  if (enabled) {
    const { data: integration } = await service
      .from("crm_integrations")
      .select("id, enabled")
      .eq("organization_id", line.organization_id)
      .eq("provider", "ghl")
      .maybeSingle();
    if (!integration) {
      return NextResponse.json(
        {
          error:
            "Set up a GoHighLevel integration for this organization first.",
        },
        { status: 400 },
      );
    }
  }

  const { error: updateErr } = await service
    .from("material_lines")
    .update({ ghl_push_enabled: enabled })
    .eq("id", materialLineId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled });
}
