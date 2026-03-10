"use client";

import { useState } from "react";
import Image from "next/image";
import { BACKSPLASH_HEIGHTS } from "@/lib/v2/types";
import type { BacksplashHeightId } from "@/lib/v2/types";
import type { V2Material } from "@/lib/v2/materials";

type MaterialSource = "match_countertop" | "other";

interface V2BacksplashSelectorProps {
  materials: V2Material[];
  onGenerate: (
    heightId: BacksplashHeightId,
    heightPromptDesc: string,
    materialSource: MaterialSource,
    material?: V2Material,
  ) => void;
  disabled: boolean;
  isLocalDev: boolean;
}

const HEIGHT_ICONS: Record<string, React.ReactNode> = {
  none: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  ),
  "4in": (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="16" width="18" height="3" rx="0.5" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeWidth={1.5} d="M3 15V5M21 15V5" />
    </svg>
  ),
  mid: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="11" width="18" height="8" rx="0.5" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeWidth={1.5} d="M3 10V5M21 10V5" />
    </svg>
  ),
  full: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="7" width="18" height="12" rx="0.5" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeWidth={1.5} d="M3 6V4M21 6V4" />
    </svg>
  ),
  full_wall: (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="4" width="18" height="16" rx="0.5" strokeWidth={1.5} />
    </svg>
  ),
};

export default function V2BacksplashSelector({
  materials,
  onGenerate,
  disabled,
  isLocalDev,
}: V2BacksplashSelectorProps) {
  const [selectedHeight, setSelectedHeight] =
    useState<BacksplashHeightId | null>(null);
  const [materialSource, setMaterialSource] =
    useState<MaterialSource>("match_countertop");
  const [selectedMaterial, setSelectedMaterial] = useState<V2Material | null>(
    null,
  );

  const heightInfo = BACKSPLASH_HEIGHTS.find((h) => h.id === selectedHeight);

  const canGenerate =
    !disabled &&
    selectedHeight !== null &&
    (materialSource === "match_countertop" ||
      selectedMaterial !== null ||
      selectedHeight === "none");

  const handleGenerate = () => {
    if (!canGenerate || !selectedHeight || !heightInfo) return;
    onGenerate(
      selectedHeight,
      heightInfo.promptDesc,
      selectedHeight === "none" ? "match_countertop" : materialSource,
      materialSource === "other" ? (selectedMaterial ?? undefined) : undefined,
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-4 animate-fade-in">
      {/* Height Picker */}
      <div className="mb-5">
        <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          Backsplash Height
        </p>
        <div className="flex flex-wrap gap-2">
          {BACKSPLASH_HEIGHTS.map((h) => {
            const isSelected = selectedHeight === h.id;
            return (
              <button
                key={h.id}
                onClick={() => {
                  setSelectedHeight(h.id as BacksplashHeightId);
                  if (h.id === "none") setMaterialSource("match_countertop");
                }}
                disabled={disabled}
                className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border-2 transition-all duration-200 min-w-[90px] ${
                  isSelected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 ring-1 ring-[var(--color-accent)]/20"
                    : disabled
                      ? "border-[var(--color-border)] opacity-50 cursor-not-allowed"
                      : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
                }`}
              >
                <span
                  className={
                    isSelected
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-text-secondary)]"
                  }
                >
                  {HEIGHT_ICONS[h.id]}
                </span>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}
                >
                  {h.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Material Source -- hidden when "None" is selected */}
      {selectedHeight && selectedHeight !== "none" && (
        <div className="mb-5">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
            Material
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => {
                setMaterialSource("match_countertop");
                setSelectedMaterial(null);
              }}
              disabled={disabled}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                materialSource === "match_countertop"
                  ? "bg-[var(--color-accent)] text-white shadow-sm"
                  : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
              }`}
            >
              Match Countertop
            </button>
            {materials.length > 0 && (
              <button
                onClick={() => setMaterialSource("other")}
                disabled={disabled}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  materialSource === "other"
                    ? "bg-[var(--color-accent)] text-white shadow-sm"
                    : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                }`}
              >
                Other Material
              </button>
            )}
          </div>

          {/* Material Grid -- only when "Other Material" is selected */}
          {materialSource === "other" && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {materials.map((mat) => {
                const isSelected = selectedMaterial?.id === mat.id;
                const useUnoptimized =
                  isLocalDev ||
                  mat.imageUrl.includes("127.0.0.1") ||
                  mat.imageUrl.includes("localhost");

                return (
                  <button
                    key={mat.id}
                    onClick={() => setSelectedMaterial(mat)}
                    disabled={disabled}
                    className={`rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                      isSelected
                        ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30"
                        : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
                    }`}
                  >
                    <div className="aspect-square relative bg-[var(--color-bg-secondary)]">
                      {useUnoptimized ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mat.imageUrl}
                          alt={mat.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Image
                          src={mat.imageUrl}
                          alt={mat.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 16vw"
                        />
                      )}
                    </div>
                    <p className="text-[10px] font-medium text-[var(--color-text)] truncate px-1.5 py-1">
                      {mat.name}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {materialSource === "match_countertop" && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              The backsplash will use the same material as the countertop
              visible in the current image.
            </p>
          )}
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className={`w-full py-3 px-6 rounded-xl text-sm font-semibold transition-all duration-200 ${
          canGenerate
            ? "bg-[var(--color-accent)] text-white hover:opacity-90 shadow-md"
            : "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] cursor-not-allowed"
        }`}
      >
        {disabled
          ? "Generating..."
          : !selectedHeight
            ? "Select a backsplash height"
            : selectedHeight === "none"
              ? "Remove Backsplash"
              : materialSource === "other" && !selectedMaterial
                ? "Select a material"
                : "Generate Backsplash"}
      </button>
    </div>
  );
}
