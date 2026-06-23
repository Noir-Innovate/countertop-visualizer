import { redirect } from "next/navigation";
import { getOrgAccess } from "@/lib/admin-auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { OnboardingInviteTeam } from "@/components/onboarding/OnboardingInviteTeam";
import { TrackView } from "@/components/analytics/TrackView";
import { ONBOARDING_EVENTS } from "@/lib/onboarding-track";

interface Props {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ materialLineId?: string }>;
}

export default async function OnboardingTeamPage({
  params,
  searchParams,
}: Props) {
  const { orgId } = await params;
  const { materialLineId } = await searchParams;

  const access = await getOrgAccess(orgId);
  if (!access) {
    redirect(`/dashboard/login?next=/onboarding/${orgId}/team`);
  }
  if (!["owner", "admin", "super_admin"].includes(access.role)) {
    redirect(`/dashboard/organizations/${orgId}`);
  }

  const service = await createServiceClient();
  const lineQuery = service
    .from("material_lines")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("line_kind", "internal");

  const { data: line } = materialLineId
    ? await lineQuery.eq("id", materialLineId).maybeSingle()
    : await lineQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!line) {
    redirect(`/onboarding/${orgId}/website`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const doneUrl = `/onboarding/${orgId}/done?materialLineId=${encodeURIComponent(line.id)}`;

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <TrackView
        event={ONBOARDING_EVENTS.teamViewed}
        organizationId={orgId}
        profileId={user?.id}
      />
      <OnboardingStepper current="team" />

      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
          Invite your sales team
        </h1>
        <p className="mt-3 text-slate-600">
          Add the people who&apos;ll use <strong>{line.name}</strong> with
          customers. They&apos;ll get an email invite and access to your sales
          portal. You can always do this later.
        </p>
      </div>

      <OnboardingInviteTeam
        orgId={orgId}
        materialLineId={line.id}
        doneUrl={doneUrl}
      />
    </div>
  );
}
