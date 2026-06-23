import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createOrgInvitation } from "@/lib/invitations";

interface RouteParams {
  params: Promise<{ orgId: string; materialLineId: string }>;
}

type AuthResult =
  | { error: string; status: 400 | 401 | 403 | 404 | 500 }
  | { user: { id: string }; serviceClient: SupabaseClient };

/**
 * Authorize the caller as an owner/admin of the org and confirm the material
 * line exists, belongs to the org, and is an internal (sales) line. Returns a
 * service client on success.
 */
async function authorize(
  orgId: string,
  materialLineId: string,
): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

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
      error: "You must be an owner or admin to manage salespeople",
      status: 403,
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { error: "Server configuration error", status: 500 };
  }
  const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

  const { data: line } = await serviceClient
    .from("material_lines")
    .select("id, line_kind")
    .eq("id", materialLineId)
    .eq("organization_id", orgId)
    .single();

  if (!line) {
    return { error: "Material line not found", status: 404 };
  }
  if (line.line_kind !== "internal") {
    return {
      error: "Salespeople can only be assigned to internal lines",
      status: 400,
    };
  }

  return { user, serviceClient };
}

interface MemberProfile {
  profile_id: string;
  role: string;
  profiles: { id: string; full_name: string | null; email: string | null } | null;
}

function normalizeProfile(member: {
  profile_id: string;
  role: string;
  profiles:
    | { id: string; full_name: string | null; email: string | null }
    | { id: string; full_name: string | null; email: string | null }[]
    | null;
}): MemberProfile {
  return {
    profile_id: member.profile_id,
    role: member.role,
    profiles: Array.isArray(member.profiles)
      ? member.profiles[0] ?? null
      : member.profiles,
  };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, materialLineId } = await params;
    const auth = await authorize(orgId, materialLineId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    // Assignments for this line.
    const { data: assignmentRows } = await serviceClient
      .from("salesperson_line_assignments")
      .select("profile_id, created_at")
      .eq("organization_id", orgId)
      .eq("material_line_id", materialLineId);

    const assignedProfileIds = new Set(
      (assignmentRows || []).map((r) => r.profile_id),
    );

    // All sales_person members of the org (for both the assigned list and the
    // "add existing" candidate pool).
    const { data: memberRows } = await serviceClient
      .from("organization_members")
      .select("profile_id, role, profiles(id, full_name, email)")
      .eq("organization_id", orgId)
      .eq("role", "sales_person");

    const members = (memberRows || []).map(normalizeProfile);

    const assigned = members
      .filter((m) => assignedProfileIds.has(m.profile_id))
      .map((m) => ({
        profileId: m.profile_id,
        fullName: m.profiles?.full_name || null,
        email: m.profiles?.email || null,
      }));

    const candidates = members
      .filter((m) => !assignedProfileIds.has(m.profile_id))
      .map((m) => ({
        profileId: m.profile_id,
        fullName: m.profiles?.full_name || null,
        email: m.profiles?.email || null,
      }));

    // Pending invitations that include this line.
    const { data: invitationRows } = await serviceClient
      .from("organization_invitations")
      .select("id, email, expires_at")
      .eq("organization_id", orgId)
      .eq("role", "sales_person")
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .contains("assigned_material_line_ids", [materialLineId]);

    const pending = (invitationRows || []).map((inv) => ({
      id: inv.id,
      email: inv.email,
      expiresAt: inv.expires_at,
    }));

    return NextResponse.json({ assigned, candidates, pending });
  } catch (err) {
    console.error("Unexpected error in GET salespeople:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, materialLineId } = await params;
    const auth = await authorize(orgId, materialLineId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { user, serviceClient } = auth;

    const body = await request.json();
    const mode = body.mode;

    if (mode === "invite") {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const result = await createOrgInvitation({
        serviceClient,
        orgId,
        email,
        role: "sales_person",
        invitedBy: user.id,
        assignedMaterialLineIds: [materialLineId],
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status },
        );
      }
      return NextResponse.json(
        { invitation: result.invitation, email_sent: result.emailSent },
        { status: 201 },
      );
    }

    if (mode === "existing") {
      const profileId =
        typeof body.profileId === "string" ? body.profileId : "";
      if (!profileId) {
        return NextResponse.json(
          { error: "profileId is required" },
          { status: 400 },
        );
      }

      // The profile must be a sales_person member of this org.
      const { data: member } = await serviceClient
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("profile_id", profileId)
        .single();

      if (!member) {
        return NextResponse.json(
          { error: "User is not a member of this organization" },
          { status: 400 },
        );
      }
      if (member.role !== "sales_person") {
        return NextResponse.json(
          { error: "Only salespeople can be assigned to a line" },
          { status: 400 },
        );
      }

      const { error: upsertErr } = await serviceClient
        .from("salesperson_line_assignments")
        .upsert(
          {
            profile_id: profileId,
            material_line_id: materialLineId,
            organization_id: orgId,
            assigned_by: user.id,
          },
          { onConflict: "profile_id,material_line_id", ignoreDuplicates: true },
        );

      if (upsertErr) {
        console.error("Error assigning salesperson:", upsertErr);
        return NextResponse.json(
          { error: upsertErr.message || "Failed to assign salesperson" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json(
      { error: "mode must be 'invite' or 'existing'" },
      { status: 400 },
    );
  } catch (err) {
    console.error("Unexpected error in POST salespeople:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, materialLineId } = await params;
    const auth = await authorize(orgId, materialLineId);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const body = await request.json();
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    if (!profileId) {
      return NextResponse.json(
        { error: "profileId is required" },
        { status: 400 },
      );
    }

    const { error: deleteErr } = await serviceClient
      .from("salesperson_line_assignments")
      .delete()
      .eq("organization_id", orgId)
      .eq("material_line_id", materialLineId)
      .eq("profile_id", profileId);

    if (deleteErr) {
      console.error("Error removing salesperson:", deleteErr);
      return NextResponse.json(
        { error: deleteErr.message || "Failed to remove salesperson" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Unexpected error in DELETE salespeople:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
