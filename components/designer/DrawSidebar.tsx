"use client";

import type { DrawDesign, Cutout } from "@/lib/designer-types";
import {
  drawDesignNetAreaSqIn,
  sqInToSqFt,
  STANDARD_CUTOUT_SIZES,
  getDesignSurfaces,
} from "@/lib/designer-types";
import { getCabinetRunsFromOutline } from "@/lib/designer-fit";
import { cabinetRunFromLength } from "@/lib/designer-types";

interface DrawSidebarProps {
  design: DrawDesign;
  onDesignChange: (design: DrawDesign) => void;
}

function cutoutLabel(cut: Cutout): string {
  if (cut.snappedRect) {
    const match = STANDARD_CUTOUT_SIZES.find(
      (s) =>
        s.w === cut.snappedRect!.w &&
        s.h === cut.snappedRect!.h &&
        s.type === cut.type,
    );
    if (match) return match.label;
    return `${cut.type} ${cut.snappedRect.w}×${cut.snappedRect.h}"`;
  }
  return "Custom";
}

export default function DrawSidebar({
  design,
  onDesignChange,
}: DrawSidebarProps) {
  const surfaces = getDesignSurfaces(design);
  const netSqIn = drawDesignNetAreaSqIn(design);
  const netSqFt = sqInToSqFt(netSqIn);
  const cabinetRuns = surfaces.flatMap((s) =>
    s.points.length >= 3 ? getCabinetRunsFromOutline(s.points) : [],
  );
  const cabinetSummary =
    cabinetRuns.length > 0
      ? cabinetRuns
          .map((len) => cabinetRunFromLength(len).join(" + "))
          .join("; ")
      : null;

  const removeCutout = (id: string) => {
    onDesignChange({
      ...design,
      cutouts: design.cutouts.filter((c) => c.id !== id),
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900 mb-2">Draw design</h3>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Net area</span>
          <span className="font-medium">{netSqFt.toFixed(2)} sq ft</span>
        </div>
        {cabinetSummary && (
          <div className="text-slate-600 text-xs">
            Cabinet runs (in): {cabinetSummary}
          </div>
        )}
      </div>
      {surfaces.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <h4 className="font-medium text-slate-800 mb-2">Surfaces</h4>
          <ul className="space-y-2">
            {surfaces.map((s, i) => (
              <li
                key={s.id}
                className="text-xs bg-slate-50 rounded-lg px-2 py-1.5 text-slate-700"
              >
                {s.inferredShape?.label ?? `Surface ${i + 1}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {design.cutouts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <h4 className="font-medium text-slate-800 mb-2">Cutouts</h4>
          <ul className="space-y-2">
            {design.cutouts.map((cut) => (
              <li
                key={cut.id}
                className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5"
              >
                <span className="text-slate-700">{cutoutLabel(cut)}</span>
                <button
                  type="button"
                  onClick={() => removeCutout(cut.id)}
                  className="text-red-600 hover:text-red-700 font-medium"
                  aria-label={`Remove ${cutoutLabel(cut)}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
