"use client";

import type { VersionEntry } from "@/lib/v2/types";

interface V2VersionHistoryProps {
  versions: VersionEntry[];
  currentIndex: number;
  originalImage: string | null;
  onSelectVersion: (index: number) => void;
  onSelectOriginal: () => void;
}

export default function V2VersionHistory({
  versions,
  currentIndex,
  originalImage,
  onSelectVersion,
  onSelectOriginal,
}: V2VersionHistoryProps) {
  if (versions.length === 0 && !originalImage) return null;

  const isBase64 = (img: string) => img.startsWith("data:");
  const toSrc = (img: string) =>
    isBase64(img) ? img : `data:image/png;base64,${img}`;

  const isOriginalSelected = currentIndex === -1;

  return (
    <div className="w-full max-w-4xl mx-auto mt-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
          Version History
        </h3>
        <span className="text-xs text-[var(--color-text-muted)]">
          ({versions.length} generation{versions.length !== 1 ? "s" : ""})
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {/* Original thumbnail */}
        {originalImage && (
          <button
            onClick={onSelectOriginal}
            className={`relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
              isOriginalSelected
                ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30"
                : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                isBase64(originalImage) ? originalImage : toSrc(originalImage)
              }
              alt="Original"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
              <span className="text-[9px] text-white font-medium">
                Original
              </span>
            </div>
          </button>
        )}

        {/* Version thumbnails */}
        {versions.map((version, idx) => (
          <button
            key={version.id}
            onClick={() => onSelectVersion(idx)}
            className={`relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
              currentIndex === idx
                ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30"
                : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={toSrc(version.imageData)}
              alt={`Version ${idx + 1}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
              <span className="text-[9px] text-white font-medium truncate block">
                {version.materialName}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
