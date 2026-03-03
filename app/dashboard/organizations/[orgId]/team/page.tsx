import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import MemberList from "./components/MemberList";
import InviteMemberButton from "./components/InviteMemberButton";
import { getOrgAccess } from "@/lib/admin-auth";

interface Props {
  params: Promise<{ orgId: string }>;
}

export default async function TeamPage({ params }: Props) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  const access = await getOrgAccess(orgId);
  if (!access?.allowed) {
    notFound();
  }

  // Non-super-admins must be owner or admin to access team
  if (
    access.role !== "super_admin" &&
    access.role !== "owner" &&
    access.role !== "admin"
  ) {
    redirect(`/dashboard/organizations/${orgId}`);
  }

  // Super admins use service client to bypass RLS
  const db =
    access.role === "super_admin" ? await createServiceClient() : supabase;

  // Fetch organization
  const { data: org } = await db
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single();

  if (!org) {
    notFound();
  }

  // Fetch members and invitations directly using service role client
  // This avoids server-to-server cookie forwarding issues in production
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let membersWithEmails: any[] = [];
  let invitations: any[] = [];
  let fetchError: string | null = null;

  if (!supabaseUrl || !serviceRoleKey) {
    fetchError = "Server configuration error";
  } else {
    const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    // Fetch all members with their profiles using service role (bypasses RLS)
    const { data: members, error: membersError } = await serviceClient
      .from("organization_members")
      .select(
        `
        id,
        profile_id,
        role,
        created_at,
        profiles(id, full_name, email, phone)
      `,
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (membersError) {
      console.error("Error fetching members:", membersError);
      fetchError = membersError.message || "Failed to fetch members";
    } else {
      // Map members to match expected format (profiles is returned as an array from Supabase)
      membersWithEmails = (members || []).map((member: any) => ({
        ...member,
        profiles: Array.isArray(member.profiles)
          ? member.profiles[0]
          : member.profiles,
      }));
    }

    // Fetch pending invitations
    const { data: invitationsData, error: invitationsError } =
      await serviceClient
        .from("organization_invitations")
        .select("id, email, role, expires_at, accepted_at")
        .eq("organization_id", orgId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });

    if (invitationsError) {
      console.error("Error fetching invitations:", invitationsError);
      // Don't fail the request if invitations fail
    } else {
      invitations = invitationsData || [];
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-700">
              Dashboard
            </Link>
            <span>/</span>
            <Link
              href={`/dashboard/organizations/${orgId}`}
              className="hover:text-slate-700"
            >
              {org.name}
            </Link>
            <span>/</span>
            <span>Team</span>
          </div>
          <InviteMemberButton orgId={orgId} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Team Management</h1>
        <p className="text-slate-600 mt-1">
          Invite team members and manage their roles
        </p>
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">
            Failed to load team members: {fetchError}
          </p>
          <p className="text-red-600 text-sm mt-1">
            Please try refreshing the page. If the problem persists, contact
            support.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <MemberList
            orgId={orgId}
            members={membersWithEmails}
            invitations={invitations || []}
            currentUserId={user.id}
            currentUserRole={access.role}
          />
        </div>
      )}
    </div>
  );
}
