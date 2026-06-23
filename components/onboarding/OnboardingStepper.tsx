type StepKey =
  | "account"
  | "org"
  | "trial"
  | "website"
  | "brand"
  | "team"
  | "share";

interface Props {
  current: StepKey;
}

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "account", label: "Account" },
  { key: "org", label: "Organization" },
  { key: "trial", label: "Free Trial" },
  { key: "website", label: "Website" },
  { key: "brand", label: "Brand" },
  { key: "team", label: "Sales Team" },
  { key: "share", label: "Share" },
];

export function OnboardingStepper({ current }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  const total = STEPS.length;
  const stepNumber = currentIdx + 1;
  const step = STEPS[currentIdx];

  if (!step) return null;

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-900">{step.label}</span>
        <span className="text-xs font-medium text-slate-500">
          {stepNumber}/{total}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${(stepNumber / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
