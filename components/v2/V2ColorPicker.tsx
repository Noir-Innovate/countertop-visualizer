"use client";

import type { MaterialColor } from "@/lib/v2/materials";
import type { V2Material } from "@/lib/v2/materials";

interface V2ColorPickerProps {
  material: V2Material;
  colors: MaterialColor[];
  onColorSelect: (material: V2Material, color: MaterialColor) => void;
  onCancel: () => void;
}

export default function V2ColorPicker({
  material,
  colors,
  onColorSelect,
  onCancel,
}: V2ColorPickerProps) {
  return (
    <div className="w-full max-w-4xl mx-auto mt-4 animate-fade-in">
      <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">
              Pick a color for{" "}
              <span className="text-[var(--color-accent)]">
                {material.name}
              </span>
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
              Select a cabinet color to apply this design
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-1"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {colors.map((color) => (
            <button
              key={color.name}
              onClick={() => onColorSelect(material, color)}
              className="group flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/60 transition-colors"
            >
              <span
                className="w-12 h-12 rounded-xl border-2 border-white shadow-md group-hover:scale-110 transition-transform"
                style={{ backgroundColor: color.hex }}
              />
              <span className="text-xs font-medium text-[var(--color-text)] whitespace-nowrap">
                {color.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
