"use client";

import { useMaterialLine } from "@/lib/material-line";

interface StepHeaderProps {
  instruction: string;
  stepNumber?: number;
  totalSteps?: number;
}

export default function StepHeader({
  instruction,
  stepNumber,
  totalSteps = 3,
}: StepHeaderProps) {
  const materialLine = useMaterialLine();
  const isExample = !materialLine || materialLine.id === "default";

  return (
    <header className="text-center mb-8 animate-slide-up">
      {/* Company Logo */}
      <div className="flex justify-center mb-6">
        {isExample || !materialLine?.logoUrl ? (
          <div className="h-16 md:h-20 flex items-center justify-center px-8 py-4 border-2 border-dashed border-[var(--color-border)] rounded-lg">
            <span className="text-xl md:text-2xl font-semibold text-[var(--color-text-secondary)]">
              Your Logo Here
            </span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={materialLine.logoUrl}
            alt={materialLine.name}
            className="h-16 md:h-20 w-auto object-contain"
          />
        )}
      </div>

      {/* Step Indicator */}
      {stepNumber && (
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i + 1 === stepNumber
                  ? "bg-[var(--color-accent)]"
                  : i + 1 < stepNumber
                  ? "bg-[var(--color-accent)]/50"
                  : "bg-[var(--color-border)]"
              }`}
            />
          ))}
        </div>
      )}

      {/* Large Instruction Text */}
      <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[var(--color-text)] leading-tight">
        {instruction}
      </h1>
    </header>
  );
}
