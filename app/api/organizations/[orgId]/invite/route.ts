import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { sendInvitationEmail } from "@/lib/resend";

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
        { status: 403 }
      );
    }

    // Get request body
    const body = await request.json();
    const { email, role } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate role - only owners can invite other owners
    const validRoles = ["owner", "admin", "member", "sales_person"];
    const invitationRole = role || "member";
    if (!validRoles.includes(invitationRole)) {
      return NextResponse.json(
        { error: `Role must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    // Only owners can invite other owners
    if (invitationRole === "owner" && membership.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can invite other owners" },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Check if user with this email already exists
    const { data: existingUser } = await serviceClient.auth.admin.listUsers();
    const userWithEmail = existingUser.users.find((u) => u.email === email);

    if (userWithEmail) {
      // Check if already a member
      const { data: existingMember } = await serviceClient
        .from("organization_members")
        .select("id")
        .eq("profile_id", userWithEmail.id)
        .eq("organization_id", orgId)
        .single();

      if (existingMember) {
        return NextResponse.json(
          { error: "User is already a member of this organization" },
          { status: 400 }
        );
      }
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await serviceClient
      .from("organization_invitations")
      .select("id")
      .eq("organization_id", orgId)
      .eq("email", email)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (existingInvitation) {
      return NextResponse.json(
        { error: "An invitation has already been sent to this email" },
        { status: 400 }
      );
    }

    // Generate secure token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    // Create invitation using service role
    const { data: invitation, error: inviteError } = await serviceClient
      .from("organization_invitations")
      .insert({
        organization_id: orgId,
        email,
        role: invitationRole,
        invited_by: user.id,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Error creating invitation:", inviteError);
      return NextResponse.json(
        { error: inviteError.message || "Failed to create invitation" },
        { status: 500 }
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
      .eq("id", user.id)
      .single();

    // Get base URL - prioritize NEXT_PUBLIC_APP_URL, then VERCEL_URL, then localhost
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const invitationUrl = `${baseUrl}/dashboard/invitations/${token}`;

    // Send invitation email
    const emailResult = await sendInvitationEmail({
      to: email,
      organizationName: org?.name || "the organization",
      role: invitationRole,
      invitationUrl,
      inviterName: inviterProfile?.full_name || undefined,
    });

    if (!emailResult.success) {
      console.error("Failed to send invitation email:", emailResult.error);
      // Don't fail the request if email fails - invitation is still created
    }

    return NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expires_at: invitation.expires_at,
        },
        email_sent: emailResult.success,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
