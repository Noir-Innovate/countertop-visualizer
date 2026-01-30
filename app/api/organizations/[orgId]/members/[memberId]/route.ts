import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ orgId: string; memberId: string }>;
}

// DELETE: Remove a member from the organization
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, memberId } = await params;

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
        { error: "You must be an owner or admin to remove members" },
        { status: 403 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Get the member being removed
    const { data: memberToRemove } = await serviceClient
      .from("organization_members")
      .select("profile_id, role")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .single();

    if (!memberToRemove) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent removing yourself if you're the owner
    if (
      memberToRemove.profile_id === user.id &&
      memberToRemove.role === "owner"
    ) {
      return NextResponse.json(
        { error: "You cannot remove yourself as the owner" },
        { status: 400 },
      );
    }

    // Delete the member
    const { error: deleteError } = await serviceClient
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", orgId);

    if (deleteError) {
      console.error("Error removing member:", deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Failed to remove member" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

// PATCH: Update a member's role
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, memberId } = await params;
    const body = await request.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json({ error: "Role is required" }, { status: 400 });
    }

    // Validate role
    const validRoles = ["owner", "admin", "member", "sales_person"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${validRoles.join(", ")}` },
        { status: 400 },
      );
    }

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
        { error: "You must be an owner or admin to update member roles" },
        { status: 403 },
      );
    }

    // Only owners can assign owner role
    if (role === "owner" && membership.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can assign the owner role" },
        { status: 403 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Get the member being updated
    const { data: memberToUpdate } = await serviceClient
      .from("organization_members")
      .select("profile_id, role")
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .single();

    if (!memberToUpdate) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Prevent changing your own role from owner
    if (
      memberToUpdate.profile_id === user.id &&
      memberToUpdate.role === "owner" &&
      role !== "owner"
    ) {
      return NextResponse.json(
        { error: "You cannot change your own role from owner" },
        { status: 400 },
      );
    }

    // Update the member's role
    const { data: updatedMember, error: updateError } = await serviceClient
      .from("organization_members")
      .update({ role })
      .eq("id", memberId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating member role:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update member role" },
        { status: 500 },
      );
    }

    return NextResponse.json({ member: updatedMember }, { status: 200 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
