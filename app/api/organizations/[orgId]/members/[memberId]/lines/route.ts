import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ orgId: string; memberId: string }>;
}

async function authorize(orgId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();

  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    return {
      error: "You must be an owner or admin to manage member assignments",
      status: 403 as const,
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { error: "Server configuration error", status: 500 as const };
  }
  const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);
  return { user, serviceClient };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, memberId } = await params;
    const auth = await authorize(orgId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const { data: member } = await serviceClient
      .from("organization_members")
      .select("profile_id, role")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const { data: assignments } = await serviceClient
      .from("salesperson_line_assignments")
      .select("material_line_id")
      .eq("profile_id", member.profile_id)
      .eq("organization_id", orgId);

    return NextResponse.json({
      assignedMaterialLineIds: (assignments || []).map((a) => a.material_line_id),
    });
  } catch (err) {
    console.error("Unexpected error in GET lines:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, memberId } = await params;
    const auth = await authorize(orgId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { user, serviceClient } = auth;

    const body = await request.json();
    const rawIds = Array.isArray(body.assignedMaterialLineIds)
      ? body.assignedMaterialLineIds
      : [];
    const assignedMaterialLineIds: string[] = Array.from(
      new Set(
        rawIds.filter(
          (v: unknown): v is string => typeof v === "string" && v.length > 0,
        ),
      ),
    );

    const { data: member } = await serviceClient
      .from("organization_members")
      .select("profile_id, role")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (member.role !== "sales_person") {
      return NextResponse.json(
        { error: "Line assignments are only meaningful for sales persons" },
        { status: 400 },
      );
    }

    if (assignedMaterialLineIds.length > 0) {
      const { data: orgLines } = await serviceClient
        .from("material_lines")
        .select("id")
        .eq("organization_id", orgId)
        .in("id", assignedMaterialLineIds);
      const validIds = new Set((orgLines || []).map((l) => l.id));
      if (!assignedMaterialLineIds.every((id) => validIds.has(id))) {
        return NextResponse.json(
          {
            error:
              "One or more material lines do not belong to this organization",
          },
          { status: 400 },
        );
      }
    }

    const { data: existing } = await serviceClient
      .from("salesperson_line_assignments")
      .select("material_line_id")
      .eq("profile_id", member.profile_id)
      .eq("organization_id", orgId);

    const existingIds = new Set((existing || []).map((r) => r.material_line_id));
    const desiredIds = new Set(assignedMaterialLineIds);

    const toInsert = assignedMaterialLineIds.filter(
      (id) => !existingIds.has(id),
    );
    const toDelete = Array.from(existingIds).filter((id) => !desiredIds.has(id));

    if (toInsert.length > 0) {
      const rows = toInsert.map((id) => ({
        profile_id: member.profile_id,
        material_line_id: id,
        organization_id: orgId,
        assigned_by: user.id,
      }));
      const { error: insertErr } = await serviceClient
        .from("salesperson_line_assignments")
        .upsert(rows, {
          onConflict: "profile_id,material_line_id",
          ignoreDuplicates: true,
        });
      if (insertErr) {
        console.error("Error inserting assignments:", insertErr);
        return NextResponse.json(
          { error: insertErr.message || "Failed to add assignments" },
          { status: 500 },
        );
      }
    }

    if (toDelete.length > 0) {
      const { error: deleteErr } = await serviceClient
        .from("salesperson_line_assignments")
        .delete()
        .eq("profile_id", member.profile_id)
        .eq("organization_id", orgId)
        .in("material_line_id", toDelete);
      if (deleteErr) {
        console.error("Error deleting assignments:", deleteErr);
        return NextResponse.json(
          { error: deleteErr.message || "Failed to remove assignments" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      assignedMaterialLineIds,
    });
  } catch (err) {
    console.error("Unexpected error in PUT lines:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
