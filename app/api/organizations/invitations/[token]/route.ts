import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to accept an invitation" },
        { status: 401 },
      );
    }

    // Get invitation details
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .select("*")
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 404 },
      );
    }

    // Check if invitation is already accepted
    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: "This invitation has already been accepted" },
        { status: 400 },
      );
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 400 },
      );
    }

    // Verify email matches
    if (invitation.email !== user.email) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 },
      );
    }

    // Check if user is already a member
    const { data: existingMember } = await serviceClient
      .from("organization_members")
      .select("id")
      .eq("profile_id", user.id)
      .eq("organization_id", invitation.organization_id)
      .single();

    if (existingMember) {
      // Mark invitation as accepted even if already a member
      await serviceClient
        .from("organization_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      return NextResponse.json(
        {
          message: "You are already a member of this organization",
          organization_id: invitation.organization_id,
        },
        { status: 200 },
      );
    }

    // Ensure profile exists
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      // Create profile if it doesn't exist
      await serviceClient.from("profiles").insert({
        id: user.id,
        full_name:
          user.user_metadata?.full_name || user.user_metadata?.name || null,
      });
    }

    // Add user to organization
    const { error: memberError } = await serviceClient
      .from("organization_members")
      .insert({
        profile_id: user.id,
        organization_id: invitation.organization_id,
        role: invitation.role,
      });

    if (memberError) {
      console.error("Error adding member:", memberError);
      return NextResponse.json(
        { error: memberError.message || "Failed to accept invitation" },
        { status: 500 },
      );
    }

    // Mark invitation as accepted
    const { error: updateError } = await serviceClient
      .from("organization_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    if (updateError) {
      console.error("Error updating invitation:", updateError);
      // Don't fail the request if this fails - member is already added
    }

    return NextResponse.json(
      {
        message: "Invitation accepted successfully",
        organization_id: invitation.organization_id,
      },
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

// GET endpoint to view invitation details (for the invitation page)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .select(
        `
        id,
        email,
        role,
        expires_at,
        accepted_at,
        created_at,
        organizations(id, name)
      `,
      )
      .eq("token", token)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 404 },
      );
    }

    // Check if expired
    const isExpired = new Date(invitation.expires_at) < new Date();

    return NextResponse.json({
      invitation: {
        ...invitation,
        is_expired: isExpired,
        is_accepted: !!invitation.accepted_at,
      },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
