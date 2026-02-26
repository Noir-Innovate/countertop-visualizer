"use client";

import Image from "next/image";
import type { Slab } from "@/lib/types";

interface SlabSelectorDesignerProps {
  slabs: Slab[];
  loading: boolean;
  selected: Slab | null;
  onSelect: (slab: Slab) => void;
}

export default function SlabSelectorDesigner({
  slabs,
  loading,
  selected,
  onSelect,
}: SlabSelectorDesignerProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-2">Slab</h3>
        <p className="text-sm text-slate-500">Loading materials...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900 mb-2">Slab</h3>
      <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
        {slabs.map((slab) => (
          <button
            key={slab.id}
            type="button"
            onClick={() => onSelect(slab)}
            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
              selected?.id === slab.id
                ? "border-blue-600 ring-2 ring-blue-200"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <img
              src={slab.imageUrl}
              alt={slab.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
              {slab.name}
              {slab.price_per_sqft != null && (
                <span className="block text-slate-300">
                  ${slab.price_per_sqft}/sq ft
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
