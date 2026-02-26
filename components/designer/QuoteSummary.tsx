"use client";

import {
  polygonAreaSqIn,
  sqInToSqFt,
  pieceToPolygon,
  transformPolygon,
  drawDesignNetAreaSqIn,
} from "@/lib/designer-types";
import type { CountertopPiece, DrawDesign } from "@/lib/designer-types";
import type { Slab } from "@/lib/types";

interface QuoteSummaryProps {
  pieces: CountertopPiece[];
  slab: Slab | null;
  /** When provided (e.g. 2D draw mode), quote uses net area from draw design instead of pieces */
  drawDesign?: DrawDesign | null;
}

export default function QuoteSummary({
  pieces,
  slab,
  drawDesign,
}: QuoteSummaryProps) {
  const totalSqFt =
    drawDesign != null
      ? sqInToSqFt(drawDesignNetAreaSqIn(drawDesign))
      : pieces.reduce(
          (sum, p) =>
            sum +
            sqInToSqFt(
              polygonAreaSqIn(
                transformPolygon(pieceToPolygon(p), p.position, p.rotation),
              ),
            ),
          0,
        );
  const pricePerSqft = slab?.price_per_sqft ?? null;
  const total =
    pricePerSqft != null && totalSqFt > 0 ? totalSqFt * pricePerSqft : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900 mb-2">Quote</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Total area</span>
          <span className="font-medium">{totalSqFt.toFixed(2)} sq ft</span>
        </div>
        {slab && (
          <div className="flex justify-between">
            <span className="text-slate-600">Material</span>
            <span className="font-medium">{slab.name}</span>
          </div>
        )}
        {pricePerSqft != null && (
          <div className="flex justify-between">
            <span className="text-slate-600">Price per sq ft</span>
            <span className="font-medium">${pricePerSqft.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t border-slate-200 pt-2 mt-2">
          <div className="flex justify-between font-semibold">
            <span>Estimated total</span>
            <span>
              {total != null
                ? `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                : "Contact for quote"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
