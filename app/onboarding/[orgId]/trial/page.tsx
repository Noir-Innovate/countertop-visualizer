import { redirect } from "next/navigation";
import { getOrgAccess } from "@/lib/admin-auth";
import {
  getOnboardingNextStep,
  onboardingStepUrl,
} from "@/lib/onboarding-state";
import { createServiceClient } from "@/lib/supabase/server";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { EmbeddedTrialForm } from "./EmbeddedTrialForm";

interface Props {
  params: Promise<{ orgId: string }>;
}

const TRIAL_DAYS = parseInt(process.env.STRIPE_TRIAL_DAYS ?? "7", 10);

export default async function OnboardingTrialPage({ params }: Props) {
  const { orgId } = await params;
  const access = await getOrgAccess(orgId);

  if (!access) {
    redirect(`/dashboard/login?next=/onboarding/${orgId}/trial`);
  }
  if (!["owner", "admin", "super_admin"].includes(access.role)) {
    redirect(`/dashboard/organizations/${orgId}`);
  }

  const state = await getOnboardingNextStep(orgId);
  if (state.step !== "needs_billing") {
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
      <OnboardingStepper current="trial" />

      <div className="mb-8">
        <p className="text-sm text-slate-500 mb-1">
          Setting up {org?.name ?? "your organization"}
        </p>
        <h1 className="text-3xl font-bold text-slate-900">
          Start your {TRIAL_DAYS}-day free trial
        </h1>
        <p className="text-slate-600 mt-2">
          Add a payment method to unlock the visualizer. You won&apos;t be
          charged for {TRIAL_DAYS} days — cancel anytime from the billing
          settings.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <ul className="space-y-3 text-sm text-slate-700 mb-6">
          <li className="flex items-start gap-2">
            <span className="text-emerald-600">✓</span>
            <span>Unlimited internal material lines</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600">✓</span>
            <span>Auto-generated visualizer for showroom + in-home visits</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600">✓</span>
            <span>Invite your sales team to share with customers</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-600">✓</span>
            <span>
              <strong>$0 today</strong> — billed $250/month after the trial
            </span>
          </li>
        </ul>

        <EmbeddedTrialForm orgId={orgId} trialDays={TRIAL_DAYS} />
      </div>
    </div>
  );
}
