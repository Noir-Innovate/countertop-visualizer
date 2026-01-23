"use client";

import Image from "next/image";
import type { Slab } from "@/lib/types";

interface SlabSelectorProps {
  slabs: Slab[];
  selectedSlabs: Slab[];
  onSlabSelect: (slab: Slab) => void;
  maxSelections?: number;
  generatedSlabIds?: string[];
}

export default function SlabSelector({
  slabs,
  selectedSlabs,
  onSlabSelect,
  maxSelections = 3,
  generatedSlabIds = [],
}: SlabSelectorProps) {
  const isSelected = (slab: Slab) =>
    selectedSlabs.some((s) => s.id === slab.id);
  const isDisabled = (slab: Slab) =>
    !isSelected(slab) && selectedSlabs.length >= maxSelections;
  const isGenerated = (slab: Slab) => generatedSlabIds.includes(slab.id);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {slabs.map((slab) => {
          const selected = isSelected(slab);
          const disabled = isDisabled(slab);
          const generated = isGenerated(slab);

          return (
            <button
              key={slab.id}
              onClick={() => onSlabSelect(slab)}
              disabled={disabled}
              className={`
                group relative flex flex-col overflow-hidden rounded-xl border-2 
                transition-all duration-200 text-left
                ${
                  selected
                    ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-offset-2"
                    : disabled
                    ? "border-[var(--color-border)] opacity-50 cursor-not-allowed"
                    : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:shadow-md"
                }
              `}
            >
              {/* Slab Image */}
              <div className="relative aspect-square overflow-hidden bg-[var(--color-bg-secondary)]">
                <Image
                  src={slab.imageUrl}
                  alt={slab.name}
                  fill
                  className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>

              {/* Slab Info */}
              <div className="p-3 bg-white flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-[var(--color-text)] text-sm flex-1 truncate">
                    {slab.name}
                  </h3>
                  {slab.material_type && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full whitespace-nowrap flex-shrink-0">
                      {slab.material_type}
                    </span>
                  )}
                </div>
              </div>

              {/* Selected Indicator */}
              {selected && (
                <div className="absolute top-2 right-2 bg-[var(--color-success)] text-white rounded-full p-1.5 shadow-lg z-10">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}

              {/* Generated Indicator */}
              {generated && (
                <div className="absolute top-2 left-2 bg-green-500 text-white rounded-full p-1.5 shadow-lg z-10">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
