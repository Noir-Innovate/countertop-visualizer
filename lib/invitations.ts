import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { sendInvitationEmail } from "@/lib/resend";

export interface CreateInvitationParams {
  serviceClient: SupabaseClient;
  orgId: string;
  email: string;
  role: string;
  invitedBy: string;
  assignedMaterialLineIds?: string[];
}

export interface CreateInvitationResult {
  ok: boolean;
  status: number;
  error?: string;
  invitation?: {
    id: string;
    email: string;
    role: string;
    expires_at: string;
  };
  emailSent?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared invitation creation logic used by both the team-page invite endpoint
 * and the line-scoped salespeople endpoint. Performs email validation, dedupes
 * against existing members and pending invitations, validates that any assigned
 * material lines belong to the org, inserts the invitation, and sends the email.
 *
 * Authorization (caller must be owner/admin, owner-only for owner role) is the
 * caller's responsibility — this helper assumes it has already been checked.
 */
export async function createOrgInvitation({
  serviceClient,
  orgId,
  email,
  role,
  invitedBy,
  assignedMaterialLineIds = [],
}: CreateInvitationParams): Promise<CreateInvitationResult> {
  if (!email) {
    return { ok: false, status: 400, error: "Email is required" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { ok: false, status: 400, error: "Invalid email format" };
  }

  // Validate assigned lines belong to this org.
  if (assignedMaterialLineIds.length > 0) {
    const { data: orgLines } = await serviceClient
      .from("material_lines")
      .select("id")
      .eq("organization_id", orgId)
      .in("id", assignedMaterialLineIds);
    const validIds = new Set((orgLines || []).map((l) => l.id));
    if (!assignedMaterialLineIds.every((id) => validIds.has(id))) {
      return {
        ok: false,
        status: 400,
        error: "One or more material lines do not belong to this organization",
      };
    }
  }

  // Check if a user with this email is already a member.
  const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
  const userWithEmail = existingUsers.users.find((u) => u.email === email);

  if (userWithEmail) {
    const { data: existingMember } = await serviceClient
      .from("organization_members")
      .select("id")
      .eq("profile_id", userWithEmail.id)
      .eq("organization_id", orgId)
      .single();

    if (existingMember) {
      return {
        ok: false,
        status: 400,
        error: "User is already a member of this organization",
      };
    }
  }

  // Check for an existing pending invitation.
  const { data: existingInvitation } = await serviceClient
    .from("organization_invitations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (existingInvitation) {
    return {
      ok: false,
      status: 400,
      error: "An invitation has already been sent to this email",
    };
  }

  // Generate secure token + 7-day expiry.
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: invitation, error: inviteError } = await serviceClient
    .from("organization_invitations")
    .insert({
      organization_id: orgId,
      email,
      role,
      invited_by: invitedBy,
      token,
      expires_at: expiresAt.toISOString(),
      assigned_material_line_ids: assignedMaterialLineIds,
    })
    .select()
    .single();

  if (inviteError || !invitation) {
    console.error("Error creating invitation:", inviteError);
    return {
      ok: false,
      status: 500,
      error: inviteError?.message || "Failed to create invitation",
    };
  }

  // Org name + inviter name for the email body.
  const { data: org } = await serviceClient
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  const { data: inviterProfile } = await serviceClient
    .from("profiles")
    .select("full_name")
    .eq("id", invitedBy)
    .single();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const invitationUrl = `${baseUrl}/dashboard/invitations/${token}`;

  const emailResult = await sendInvitationEmail({
    to: email,
    organizationName: org?.name || "the organization",
    role,
    invitationUrl,
    inviterName: inviterProfile?.full_name || undefined,
  });

  if (!emailResult.success) {
    console.error("Failed to send invitation email:", emailResult.error);
    // Don't fail — the invitation is still created.
  }

  return {
    ok: true,
    status: 201,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expires_at: invitation.expires_at,
    },
    emailSent: emailResult.success,
  };
}
