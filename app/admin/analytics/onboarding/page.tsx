import { OnboardingFunnelClient } from "./OnboardingFunnelClient";

export default function AdminOnboardingFunnelPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Onboarding funnel
      </h1>
      <p className="text-slate-600 text-sm mb-6">
        Conversion + drop-off across the new-user funnel. Stages are anchored
        on the view event for each page; bars below show distinct profiles who
        reached that stage.
      </p>
      <OnboardingFunnelClient />
    </div>
  );
}
