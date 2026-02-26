"use client";

import { useState } from "react";
import type { CountertopPiece } from "@/lib/designer-types";
import {
  pieceToPolygon,
  polygonAreaSqIn,
  sqInToSqFt,
  transformPolygon,
} from "@/lib/designer-types";

interface LayoutEditor2DProps {
  pieces: CountertopPiece[];
  onChange: (pieces: CountertopPiece[]) => void;
  selectedId?: string | null;
  onSelectId?: (id: string | null) => void;
}

let nextId = 1;
function generateId() {
  return `piece-${nextId++}`;
}

export default function LayoutEditor2D({
  pieces,
  onChange,
  selectedId: controlledSelectedId,
  onSelectId,
}: LayoutEditor2DProps) {
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedId = controlledSelectedId ?? internalSelected;
  const setSelectedId = onSelectId ?? setInternalSelected;

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

  const updatePiece = (id: string, upd: Partial<CountertopPiece>) => {
    onChange(pieces.map((p) => (p.id === id ? { ...p, ...upd } : p)));
  };

  const addPiece = (shape: "rectangle" | "l" | "t") => {
    const base: CountertopPiece = {
      id: generateId(),
      shape,
      width: 96,
      depth: 24,
      position: { x: pieces.length * 30, y: pieces.length * 30 },
      rotation: 0,
    };
    if (shape === "l") {
      base.legWidth = 24;
      base.legDepth = 24; // main run depth
      base.depth = 96; // total depth (leg extends 72")
    }
    if (shape === "t") {
      base.armWidth = 36;
      base.armDepth = 24;
    }
    onChange([...pieces, base]);
    onSelectId?.(base.id);
  };

  const removePiece = (id: string) => {
    onChange(pieces.filter((p) => p.id !== id));
    if (selectedId === id) onSelectId?.(null);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="font-semibold text-slate-900 mb-2">Layout</h3>
      <p className="text-xs text-slate-500 mb-2">
        Total: {totalSqFt.toFixed(2)} sq ft
      </p>

      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => addPiece("rectangle")}
            className="text-xs px-2 py-1.5 bg-slate-100 rounded hover:bg-slate-200"
          >
            + Rectangle
          </button>
          <button
            type="button"
            onClick={() => addPiece("l")}
            className="text-xs px-2 py-1.5 bg-slate-100 rounded hover:bg-slate-200"
          >
            + L-shape
          </button>
          <button
            type="button"
            onClick={() => addPiece("t")}
            className="text-xs px-2 py-1.5 bg-slate-100 rounded hover:bg-slate-200"
          >
            + T-shape
          </button>
        </div>

        {pieces.map((piece) => (
          <div
            key={piece.id}
            className={`border rounded-lg p-3 text-sm ${
              selectedId === piece.id
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200"
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium capitalize">{piece.shape}</span>
              <button
                type="button"
                onClick={() => removePiece(piece.id)}
                className="text-red-600 hover:text-red-700 text-xs"
              >
                Remove
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                onSelectId?.(piece.id === selectedId ? null : piece.id)
              }
              className="w-full text-left"
            >
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-1">
                  Width:{" "}
                  <input
                    type="number"
                    min="12"
                    max="240"
                    value={piece.width}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updatePiece(piece.id, {
                        width: Number(e.target.value) || 24,
                      })
                    }
                    className="w-14 px-1 py-0.5 border rounded"
                  />
                  in
                </label>
                <label className="flex items-center gap-1">
                  Depth:{" "}
                  <input
                    type="number"
                    min="12"
                    max="48"
                    value={piece.depth}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updatePiece(piece.id, {
                        depth: Number(e.target.value) || 24,
                      })
                    }
                    className="w-14 px-1 py-0.5 border rounded"
                  />
                  in
                </label>
                {piece.shape === "polygon" && (
                  <p className="text-xs text-slate-500 col-span-2">
                    Custom shape (from AI)
                  </p>
                )}
                {(piece.shape === "l" || piece.shape === "t") && (
                  <>
                    <label className="flex items-center gap-1">
                      Leg/Arm W:{" "}
                      <input
                        type="number"
                        min="12"
                        max="96"
                        value={
                          piece.shape === "l"
                            ? (piece.legWidth ?? 24)
                            : (piece.armWidth ?? 36)
                        }
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 24;
                          updatePiece(
                            piece.id,
                            piece.shape === "l"
                              ? { legWidth: v }
                              : { armWidth: v },
                          );
                        }}
                        className="w-14 px-1 py-0.5 border rounded"
                      />
                      in
                    </label>
                    <label className="flex items-center gap-1">
                      Leg/Arm D:{" "}
                      <input
                        type="number"
                        min="12"
                        max="96"
                        value={
                          piece.shape === "l"
                            ? (piece.legDepth ?? 72)
                            : (piece.armDepth ?? 24)
                        }
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 24;
                          updatePiece(
                            piece.id,
                            piece.shape === "l"
                              ? { legDepth: v }
                              : { armDepth: v },
                          );
                        }}
                        className="w-14 px-1 py-0.5 border rounded"
                      />
                      in
                    </label>
                  </>
                )}
                <label className="flex items-center gap-1">
                  X:{" "}
                  <input
                    type="number"
                    value={piece.position.x}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updatePiece(piece.id, {
                        position: {
                          ...piece.position,
                          x: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-14 px-1 py-0.5 border rounded"
                  />
                </label>
                <label className="flex items-center gap-1">
                  Y:{" "}
                  <input
                    type="number"
                    value={piece.position.y}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updatePiece(piece.id, {
                        position: {
                          ...piece.position,
                          y: Number(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-14 px-1 py-0.5 border rounded"
                  />
                </label>
                <label className="flex items-center gap-1 col-span-2">
                  Rotation:{" "}
                  <input
                    type="number"
                    min="0"
                    max="360"
                    step="15"
                    value={piece.rotation}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      updatePiece(piece.id, {
                        rotation: Number(e.target.value) || 0,
                      })
                    }
                    className="w-14 px-1 py-0.5 border rounded"
                  />
                  deg
                </label>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
