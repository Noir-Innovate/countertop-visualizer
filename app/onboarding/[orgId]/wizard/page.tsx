import { redirect } from "next/navigation";
import { getOrgAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";

interface Props {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ scrapeId?: string }>;
}

export default async function OnboardingWizardPage({
  params,
  searchParams,
}: Props) {
  const { orgId } = await params;
  const { scrapeId } = await searchParams;

  const access = await getOrgAccess(orgId);
  if (!access) {
    redirect(`/dashboard/login?next=/onboarding/${orgId}/wizard`);
  }
  if (!["owner", "admin", "super_admin"].includes(access.role)) {
    redirect(`/dashboard/organizations/${orgId}`);
  }
  if (!scrapeId) {
    redirect(`/onboarding/${orgId}/website`);
  }

  const service = await createServiceClient();
  const { data: scrape } = await service
    .from("org_onboarding_scrapes")
    .select(
      "id, organization_id, status, result, error, source_url, progress, created_at",
    )
    .eq("id", scrapeId)
    .maybeSingle();

  if (!scrape || scrape.organization_id !== orgId) {
    redirect(`/onboarding/${orgId}/website`);
  }

  const { data: org } = await service
    .from("organizations")
    .select("name, slug")
    .eq("id", orgId)
    .single();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <OnboardingStepper current="brand" />
      <div className="mb-6">
        <p className="text-sm text-slate-500 mb-1">
          Setting up {org?.name ?? "your organization"}
        </p>
        <h1 className="text-3xl font-bold text-slate-900">
          Confirm your branding & materials
        </h1>
        <p className="text-slate-600 mt-1 text-sm">
          Source: {scrape.source_url}
        </p>
      </div>

      <OnboardingWizard
        orgId={orgId}
        orgSlug={org?.slug ?? ""}
        orgName={org?.name ?? ""}
        scrapeId={scrape.id}
        initialStatus={scrape.status as "pending" | "running" | "complete" | "failed"}
        initialResult={scrape.result}
        initialError={scrape.error}
        initialProgress={scrape.progress ?? null}
        scrapeCreatedAt={scrape.created_at}
      />
    </div>
  );
}
