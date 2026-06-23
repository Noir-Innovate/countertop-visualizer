import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createOrgInvitation } from "@/lib/invitations";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is owner or admin of the organization
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
      return NextResponse.json(
        { error: "You must be an owner or admin to invite members" },
        { status: 403 },
      );
    }

    // Get request body
    const body = await request.json();
    const { email, role } = body;
    const assignedMaterialLineIds: string[] = Array.isArray(
      body.assignedMaterialLineIds,
    )
      ? body.assignedMaterialLineIds.filter(
          (v: unknown): v is string => typeof v === "string" && v.length > 0,
        )
      : [];

    // Validate role - only owners can invite other owners
    const validRoles = ["owner", "admin", "member", "sales_person"];
    const invitationRole = role || "member";
    if (!validRoles.includes(invitationRole)) {
      return NextResponse.json(
        { error: `Role must be one of: ${validRoles.join(", ")}` },
        { status: 400 },
      );
    }

    // Only owners can invite other owners
    if (invitationRole === "owner" && membership.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can invite other owners" },
        { status: 403 },
      );
    }

    // Check if user is already a member
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    const result = await createOrgInvitation({
      serviceClient,
      orgId,
      email,
      role: invitationRole,
      invitedBy: user.id,
      assignedMaterialLineIds,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        invitation: result.invitation,
        email_sent: result.emailSent,
      },
      { status: result.status },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
