"use client";

import { MATERIAL_CATEGORIES } from "@/lib/v2/materials";
import type { MaterialsByCategory } from "@/lib/v2/materials";

interface V2CategoryTabsProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  categoryCounts: MaterialsByCategory[];
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Cabinets: (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
      />
    </svg>
  ),
  Countertops: (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 6v14h16V6M4 6l2-4h12l2 4"
      />
    </svg>
  ),
  Backsplash: (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 5h16v14H4V5zm4 0v14m4-14v14m4-14v14M4 12h16"
      />
    </svg>
  ),
  Flooring: (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 15l8 4 8-4M4 11l8 4 8-4M4 7l8 4 8-4"
      />
    </svg>
  ),
};

export default function V2CategoryTabs({
  activeCategory,
  onCategoryChange,
  categoryCounts,
}: V2CategoryTabsProps) {
  return (
    <div className="w-full max-w-4xl mx-auto mt-6">
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {MATERIAL_CATEGORIES.map((cat) => {
          const countInfo = categoryCounts.find((c) => c.category === cat);
          const count = countInfo?.count || 0;
          const colorCount = countInfo?.colors?.length || 0;
          const totalCount = count + colorCount;
          const isActive = activeCategory === cat;

          // Backsplash always shows (it has the height selector even without materials)
          if (cat !== "Backsplash" && totalCount === 0) return null;

          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? "bg-[var(--color-accent)] text-white shadow-md"
                  : "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
              }`}
            >
              {CATEGORY_ICONS[cat]}
              {cat}
              {totalCount > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                  }`}
                >
                  {totalCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
