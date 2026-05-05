type StepKey =
  | "account"
  | "org"
  | "trial"
  | "website"
  | "brand"
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
  { key: "share", label: "Share" },
];

export function OnboardingStepper({ current }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm mb-8 overflow-x-auto">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <span
              className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                active
                  ? "bg-blue-600 text-white"
                  : done
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`${active ? "inline" : "hidden sm:inline"} ${
                active
                  ? "text-slate-900 font-medium"
                  : done
                    ? "text-slate-600"
                    : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-slate-300 shrink-0">›</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
