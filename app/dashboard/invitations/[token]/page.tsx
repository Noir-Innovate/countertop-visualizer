import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import AcceptInvitationForm from "./components/AcceptInvitationForm";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch invitation details
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Server configuration error</p>
        </div>
      </div>
    );
  }

  const { createClient: createSupabaseClient } = await import(
    "@supabase/supabase-js"
  );
  const serviceClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

  const { data: invitationData, error: inviteError } = await serviceClient
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
    `
    )
    .eq("token", token)
    .single();

  if (inviteError || !invitationData) {
    notFound();
  }

  // Extract organization from array (Supabase returns relations as arrays)
  const organization = Array.isArray(invitationData.organizations)
    ? invitationData.organizations[0]
    : invitationData.organizations;

  if (!organization) {
    notFound();
  }

  const isExpired = new Date(invitationData.expires_at) < new Date();
  const invitation = {
    id: invitationData.id,
    email: invitationData.email,
    role: invitationData.role,
    expires_at: invitationData.expires_at,
    accepted_at: invitationData.accepted_at,
    is_expired: isExpired,
    is_accepted: !!invitationData.accepted_at,
    organizations: organization,
  };

  if (!invitation) {
    notFound();
  }

  // Show invitation page even if not logged in
  // The AcceptInvitationForm will handle login requirement
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <AcceptInvitationForm
        invitation={invitation}
        token={token}
        userEmail={user?.email || null}
      />
    </div>
  );
}
