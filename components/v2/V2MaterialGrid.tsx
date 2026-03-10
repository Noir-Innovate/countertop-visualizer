"use client";

import Image from "next/image";
import type { V2Material } from "@/lib/v2/materials";

interface V2MaterialGridProps {
  materials: V2Material[];
  generatingMaterialId: string | null;
  onMaterialClick: (material: V2Material) => void;
  isLocalDev: boolean;
}

export default function V2MaterialGrid({
  materials,
  generatingMaterialId,
  onMaterialClick,
  isLocalDev,
}: V2MaterialGridProps) {
  if (materials.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-4 py-12 text-center">
        <div className="w-12 h-12 bg-[var(--color-bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-3">
          <svg
            className="w-6 h-6 text-[var(--color-text-muted)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        </div>
        <p className="text-[var(--color-text-secondary)] text-sm">
          No materials available in this category
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {materials.map((material) => {
          const isGenerating = generatingMaterialId === material.id;
          const isDisabled = generatingMaterialId !== null;
          const useUnoptimized =
            isLocalDev ||
            material.imageUrl.includes("127.0.0.1") ||
            material.imageUrl.includes("localhost");

          return (
            <button
              key={material.id}
              onClick={() => !isDisabled && onMaterialClick(material)}
              disabled={isDisabled}
              className={`group relative rounded-xl overflow-hidden border-2 transition-all duration-200 text-left ${
                isGenerating
                  ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30"
                  : isDisabled
                    ? "border-[var(--color-border)] opacity-50 cursor-not-allowed"
                    : "border-[var(--color-border)] hover:border-[var(--color-accent)] hover:shadow-lg"
              }`}
            >
              <div className="aspect-square relative bg-[var(--color-bg-secondary)] overflow-hidden">
                {useUnoptimized ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={material.imageUrl}
                    alt={material.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <Image
                    src={material.imageUrl}
                    alt={material.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                  />
                )}

                {isGenerating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg
                      className="animate-spin h-8 w-8 text-white"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              <div className="p-2.5">
                <p
                  className="font-medium text-[var(--color-text)] text-sm truncate"
                  title={material.name}
                >
                  {material.name}
                </p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {material.material_type && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">
                      {material.material_type}
                    </span>
                  )}
                  {material.price_per_sqft != null && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">
                      ${material.price_per_sqft}/sqft
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
