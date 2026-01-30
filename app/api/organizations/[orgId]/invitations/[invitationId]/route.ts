import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendInvitationEmail } from "@/lib/resend";

interface RouteParams {
  params: Promise<{ orgId: string; invitationId: string }>;
}

// DELETE invitation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, invitationId } = await params;

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
        { error: "You must be an owner or admin to manage invitations" },
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

    // Verify invitation belongs to this organization
    const { data: invitation } = await serviceClient
      .from("organization_invitations")
      .select("id, organization_id")
      .eq("id", invitationId)
      .single();

    if (!invitation || invitation.organization_id !== orgId) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 },
      );
    }

    // Delete invitation
    const { error: deleteError } = await serviceClient
      .from("organization_invitations")
      .delete()
      .eq("id", invitationId)
      .eq("organization_id", orgId);

    if (deleteError) {
      console.error("Error deleting invitation:", deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete invitation" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "Invitation deleted successfully" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

// POST to resend invitation
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, invitationId } = await params;

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
        { error: "You must be an owner or admin to resend invitations" },
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

    // Get invitation details
    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("organization_id", orgId)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 },
      );
    }

    // Check if already accepted
    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: "Cannot resend an already accepted invitation" },
        { status: 400 },
      );
    }

    // Get organization name and inviter name for email
    const { data: org } = await serviceClient
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();

    const { data: inviterProfile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("id", invitation.invited_by)
      .single();

    // Get base URL - prioritize NEXT_PUBLIC_APP_URL, then VERCEL_URL, then localhost
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const invitationUrl = `${baseUrl}/dashboard/invitations/${invitation.token}`;

    // Resend invitation email
    const emailResult = await sendInvitationEmail({
      to: invitation.email,
      organizationName: org?.name || "the organization",
      role: invitation.role,
      invitationUrl,
      inviterName: inviterProfile?.full_name || undefined,
    });

    if (!emailResult.success) {
      console.error("Failed to resend invitation email:", emailResult.error);
      return NextResponse.json(
        { error: emailResult.error || "Failed to resend invitation email" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "Invitation resent successfully", email_sent: true },
      { status: 200 },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
