import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import MemberList from "./components/MemberList";
import InviteMemberButton from "./components/InviteMemberButton";

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

  // Verify user has access to this org and is owner or admin
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .single();

  if (!membership) {
    notFound();
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    redirect(`/dashboard/organizations/${orgId}`);
  }

  // Fetch organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single();

  if (!org) {
    notFound();
  }

  // Fetch members and invitations via API endpoint
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const membersResponse = await fetch(
    `${baseUrl}/api/organizations/${orgId}/members`,
    {
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    }
  );

  if (!membersResponse.ok) {
    console.error("Failed to fetch members:", membersResponse.statusText);
    redirect(`/dashboard/organizations/${orgId}`);
  }

  const { members: membersData, invitations: invitationsData } =
    await membersResponse.json();

  // Map members to match expected format (profiles is returned as an array from Supabase)
  const membersWithEmails = (membersData || []).map((member: any) => ({
    ...member,
    profiles: Array.isArray(member.profiles)
      ? member.profiles[0]
      : member.profiles,
  }));

  const invitations = invitationsData || [];

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

      <div className="space-y-6">
        <MemberList
          orgId={orgId}
          members={membersWithEmails}
          invitations={invitations || []}
          currentUserId={user.id}
          currentUserRole={membership.role}
        />
      </div>
    </div>
  );
}
