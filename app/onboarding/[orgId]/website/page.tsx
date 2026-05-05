import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgAccess } from "@/lib/admin-auth";
import {
  getOnboardingNextStep,
  onboardingStepUrl,
} from "@/lib/onboarding-state";
import { createServiceClient } from "@/lib/supabase/server";
import { WebsiteForm } from "./WebsiteForm";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";

interface Props {
  params: Promise<{ orgId: string }>;
}

export default async function OnboardingWebsitePage({ params }: Props) {
  const { orgId } = await params;
  const access = await getOrgAccess(orgId);

  if (!access) {
    redirect(`/dashboard/login?next=/onboarding/${orgId}/website`);
  }
  if (!["owner", "admin", "super_admin"].includes(access.role)) {
    redirect(`/dashboard/organizations/${orgId}`);
  }

  const state = await getOnboardingNextStep(orgId);
  if (state.step !== "needs_website") {
    redirect(onboardingStepUrl(orgId, state));
  }

  const service = await createServiceClient();
  const { data: org } = await service
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <OnboardingStepper current="website" />
      <div className="mb-8">
        <p className="text-sm text-slate-500 mb-1">
          Setting up {org?.name ?? "your organization"}
        </p>
        <h1 className="text-3xl font-bold text-slate-900">
          What&apos;s your website?
        </h1>
        <p className="text-slate-600 mt-2">
          We&apos;ll pull your logo, brand colors, and material images
          automatically so your visualizer is ready to use in minutes.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <WebsiteForm orgId={orgId} />
      </div>

      <div className="mt-6 text-center">
        <form action={skipScrape}>
          <input type="hidden" name="orgId" value={orgId} />
          <button
            type="submit"
            className="text-sm text-slate-500 hover:text-slate-700 underline-offset-4 hover:underline"
          >
            Skip — I&apos;ll set up materials manually
          </button>
        </form>
      </div>
    </div>
  );
}

async function skipScrape(formData: FormData) {
  "use server";
  const orgId = String(formData.get("orgId") ?? "");
  if (!orgId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/dashboard/login?next=/onboarding/${orgId}/website`);

  const access = await getOrgAccess(orgId);
  if (!access || !["owner", "admin", "super_admin"].includes(access.role)) {
    redirect(`/dashboard/organizations/${orgId}`);
  }

  const service = await createServiceClient();
  const { data: scrape } = await service
    .from("org_onboarding_scrapes")
    .insert({
      organization_id: orgId,
      requested_by: user.id,
      source_url: "skipped",
      status: "complete",
      result: {
        logoCandidates: [],
        imageCandidates: [],
        colorCandidates: [],
        primaryColor: null,
        title: null,
        candidateMaterials: [],
      },
    })
    .select("id")
    .single();

  redirect(
    scrape
      ? `/onboarding/${orgId}/wizard?scrapeId=${encodeURIComponent(scrape.id)}`
      : `/onboarding/${orgId}/website`,
  );
}
