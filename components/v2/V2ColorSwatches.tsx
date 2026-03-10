"use client";

import type { MaterialColor } from "@/lib/v2/materials";

interface V2ColorSwatchesProps {
  colors: MaterialColor[];
  onColorClick: (color: MaterialColor) => void;
  disabled: boolean;
}

export default function V2ColorSwatches({
  colors,
  onColorClick,
  disabled,
}: V2ColorSwatchesProps) {
  if (colors.length === 0) return null;

  return (
    <div className="w-full max-w-4xl mx-auto mt-4">
      <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
        Colors
      </p>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <button
            key={color.name}
            onClick={() => !disabled && onColorClick(color)}
            disabled={disabled}
            className={`group flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all duration-200 ${
              disabled
                ? "border-[var(--color-border)] opacity-50 cursor-not-allowed"
                : "border-[var(--color-border)] hover:border-[var(--color-accent)] hover:shadow-md"
            }`}
          >
            <span
              className="w-7 h-7 rounded-lg border border-white shadow-sm group-hover:scale-110 transition-transform flex-shrink-0"
              style={{ backgroundColor: color.hex }}
            />
            <span className="text-sm font-medium text-[var(--color-text)] whitespace-nowrap">
              {color.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
