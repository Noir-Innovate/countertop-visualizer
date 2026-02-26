"use client";

import { useRef } from "react";
import {
  polygonAreaSqIn,
  sqInToSqFt,
  pieceToPolygon,
  transformPolygon,
} from "@/lib/designer-types";
import type { CountertopPiece } from "@/lib/designer-types";
import type { Slab } from "@/lib/types";

interface ExportDocumentProps {
  pieces: CountertopPiece[];
  slab: Slab | null;
  cabinetStyle: string;
  cabinetColor: string;
  onClose: () => void;
}

export default function ExportDocument({
  pieces,
  slab,
  cabinetStyle,
  cabinetColor,
  onClose,
}: ExportDocumentProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const totalSqFt = pieces.reduce(
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

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>Countertop Design</title></head>
        <body>${printRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-900">Export Design</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-700"
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
        <div ref={printRef} className="p-6 space-y-4 text-slate-700">
          <h3 className="font-semibold text-slate-900">Design Summary</h3>
          <p>
            <strong>Total area:</strong> {totalSqFt.toFixed(2)} sq ft
          </p>
          <p>
            <strong>Pieces:</strong> {pieces.length}
          </p>
          <p>
            <strong>Material:</strong> {slab?.name ?? "None selected"}
          </p>
          <p>
            <strong>Cabinet style:</strong> {cabinetStyle}
          </p>
          <p>
            <strong>Cabinet color:</strong>{" "}
            <span style={{ color: cabinetColor }}>■</span> {cabinetColor}
          </p>
          <p>
            <strong>Estimated total:</strong>{" "}
            {total != null
              ? `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : "Contact for quote"}
          </p>
        </div>
        <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
