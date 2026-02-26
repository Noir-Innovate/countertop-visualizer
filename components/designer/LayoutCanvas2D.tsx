"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CountertopPiece,
  Cutout,
  DrawDesign,
  InferredEdit,
  LayoutPoint,
} from "@/lib/designer-types";
import {
  pieceToPolygon,
  transformPolygon,
  polygonAreaSqIn,
  sqInToSqFt,
  drawDesignNetAreaSqIn,
  pointInPolygon,
  getDesignSurfaces,
  SNAP_GRID_INCH,
} from "@/lib/designer-types";
import { snapCutout } from "@/lib/designer-cutout";
import { strokeToPolygon } from "@/lib/designer-stroke";
import { inferDrawnShape } from "@/lib/designer-drawn-shape";
import {
  strokeIntersectsPolygon,
  polygonInsidePolygon,
  replaceOutlineSegmentWithStroke,
  getCornerFromHitEdges,
} from "@/lib/designer-geometry";
import { inferEdit } from "@/lib/designer-edit";

export type EditPreview = {
  type: "edit";
  surfaceIndex: number;
  edgeIndices: number[];
  strokePolygon: LayoutPoint[];
  strokePoints: LayoutPoint[];
  inferredEdit?: InferredEdit | null;
};

interface LayoutCanvas2DProps {
  pieces: CountertopPiece[];
  onChange: (pieces: CountertopPiece[]) => void;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  drawDesign?: DrawDesign | null;
  onDrawDesignChange?: (design: DrawDesign) => void;
  editPreview?: EditPreview | null;
  onEditPreviewChange?: (preview: EditPreview | null) => void;
}

const PIXELS_PER_INCH = 1.5;
const GRID = 12;
const STROKE_TOLERANCE_INCHES = 0.6;
const MIN_STROKE_DIST_INCH = 0.5;

function snapToInch(v: number): number {
  return Math.round(v / SNAP_GRID_INCH) * SNAP_GRID_INCH;
}

export default function LayoutCanvas2D({
  pieces,
  onChange,
  selectedId,
  onSelectId,
  drawDesign,
  onDrawDesignChange,
  editPreview,
  onEditPreviewChange,
}: LayoutCanvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [currentStroke, setCurrentStroke] = useState<LayoutPoint[] | null>(null);
  const [liveCutoutPreview, setLiveCutoutPreview] = useState<{
    surfaceIndex: number;
    cutout: Cutout;
  } | null>(null);
  const isDrawMode = drawDesign != null && onDrawDesignChange != null;

  const nextCutoutId = useRef(0);
  const nextSurfaceId = useRef(0);
  const getNextCutoutId = useCallback(
    () => `cutout-${++nextCutoutId.current}`,
    [],
  );
  const getNextSurfaceId = useCallback(
    () => `surface-${++nextSurfaceId.current}`,
    [],
  );

  const toCanvas = useCallback(
    (p: LayoutPoint) => ({
      x: p.x * PIXELS_PER_INCH + 40,
      y: 400 - p.y * PIXELS_PER_INCH,
    }),
    [],
  );

  const fromCanvas = useCallback(
    (x: number, y: number): LayoutPoint => ({
      x: (x - 40) / PIXELS_PER_INCH,
      y: (400 - y) / PIXELS_PER_INCH,
    }),
    [],
  );

  const getCanvasCoords = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      if (!rect || !canvas) return null;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        mx: (e.clientX - rect.left) * scaleX,
        my: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const lastLiveEditRef = useRef<number>(0);
  const LIVE_EDIT_THROTTLE_MS = 120;

  useEffect(() => {
    if (
      !drawDesign ||
      !currentStroke ||
      currentStroke.length < 3 ||
      !onEditPreviewChange
    ) {
      if (!currentStroke || currentStroke.length < 3) {
        setLiveCutoutPreview(null);
      }
      return;
    }

    const surfaces = getDesignSurfaces(drawDesign);
    if (surfaces.length === 0) {
      setLiveCutoutPreview(null);
      return;
    }

    let editSurfaceIndex = -1;
    let editEdgeIndices: number[] = [];
    for (let i = 0; i < surfaces.length; i++) {
      const hit = strokeIntersectsPolygon(currentStroke, surfaces[i].points);
      if (hit.length >= 2) {
        editSurfaceIndex = i;
        editEdgeIndices = hit;
        break;
      }
    }

    if (editSurfaceIndex >= 0) {
      const now = Date.now();
      const alreadyInEdit =
        editPreview?.type === "edit" &&
        editPreview.surfaceIndex === editSurfaceIndex;
      if (
        alreadyInEdit &&
        now - lastLiveEditRef.current < LIVE_EDIT_THROTTLE_MS
      ) {
        return;
      }
      lastLiveEditRef.current = now;

      const surface = surfaces[editSurfaceIndex];
      const closed = [...currentStroke, currentStroke[0]];
      const poly = strokeToPolygon(closed, STROKE_TOLERANCE_INCHES);
      setLiveCutoutPreview(null);

      if (poly.length >= 3) {
        const corner = getCornerFromHitEdges(editEdgeIndices, surface.points);
        let inferredEdit: InferredEdit | null = null;
        if (corner != null) {
          inferredEdit = inferEdit(surface.points, poly, corner, {
            strokePointsForReplace: currentStroke,
            edgeIndices: editEdgeIndices,
          });
        } else if (editEdgeIndices.length >= 2) {
          const newPoints = replaceOutlineSegmentWithStroke(
            surface.points,
            currentStroke,
            editEdgeIndices,
          );
          inferredEdit = {
            editType: "replace_segment",
            label: "Custom edge",
            resultingPolygon: newPoints,
          };
        }
        if (inferredEdit) {
          onEditPreviewChange({
            type: "edit",
            surfaceIndex: editSurfaceIndex,
            edgeIndices: editEdgeIndices,
            strokePolygon: poly,
            strokePoints: currentStroke,
            inferredEdit,
          });
        }
      }
      return;
    }

    const closed = [...currentStroke, currentStroke[0]];
    const poly = strokeToPolygon(closed, STROKE_TOLERANCE_INCHES);
    if (poly.length >= 3) {
      for (let i = 0; i < surfaces.length; i++) {
        if (polygonInsidePolygon(poly, surfaces[i].points)) {
          const cutout = snapCutout(poly, surfaces[i].points, "preview");
          setLiveCutoutPreview({ surfaceIndex: i, cutout });
          onEditPreviewChange(null);
          return;
        }
      }
    }

    onEditPreviewChange(null);
    setLiveCutoutPreview(null);
  }, [
    currentStroke,
    drawDesign,
    onEditPreviewChange,
    editPreview,
  ]);

  const updatePiecePosition = useCallback(
    (id: string, dx: number, dy: number) => {
      const piece = pieces.find((p) => p.id === id);
      if (!piece) return;
      onChange(
        pieces.map((p) =>
          p.id === id
            ? {
                ...p,
                position: {
                  x: p.position.x + Math.round(dx / PIXELS_PER_INCH),
                  y: p.position.y - Math.round(dy / PIXELS_PER_INCH),
                },
              }
            : p,
        ),
      );
    },
    [pieces, onChange],
  );

  const finishStroke = useCallback(
    (stroke: LayoutPoint[]) => {
      if (!drawDesign || !onDrawDesignChange) return;
      const poly = strokeToPolygon(stroke, STROKE_TOLERANCE_INCHES);
      if (poly.length < 3) {
        setCurrentStroke(null);
        return;
      }

      const surfaces = getDesignSurfaces(drawDesign);

      let editSurfaceIndex = -1;
      let editEdgeIndices: number[] = [];
      for (let i = 0; i < surfaces.length; i++) {
        const hit = strokeIntersectsPolygon(stroke, surfaces[i].points);
        if (hit.length >= 2) {
          editSurfaceIndex = i;
          editEdgeIndices = hit;
          break;
        }
      }

      if (editSurfaceIndex >= 0 && onEditPreviewChange) {
        const surface = surfaces[editSurfaceIndex];
        const corner = getCornerFromHitEdges(editEdgeIndices, surface.points);
        let inferredEdit: InferredEdit | null = null;
        if (corner != null) {
          inferredEdit = inferEdit(surface.points, poly, corner, {
            strokePointsForReplace: stroke,
            edgeIndices: editEdgeIndices,
          });
        } else if (editEdgeIndices.length >= 2) {
          const newPoints = replaceOutlineSegmentWithStroke(
            surface.points,
            stroke,
            editEdgeIndices,
          );
          inferredEdit = {
            editType: "replace_segment",
            label: "Custom edge",
            resultingPolygon: newPoints,
          };
        }
        onEditPreviewChange({
          type: "edit",
          surfaceIndex: editSurfaceIndex,
          edgeIndices: editEdgeIndices,
          strokePolygon: poly,
          strokePoints: stroke,
          inferredEdit: inferredEdit ?? undefined,
        });
        setCurrentStroke(null);
        return;
      }

      let insideSurface: LayoutPoint[] | null = null;
      for (const s of surfaces) {
        if (s.points.length >= 3 && polygonInsidePolygon(poly, s.points)) {
          insideSurface = s.points;
          break;
        }
      }

      if (insideSurface) {
        const cutout = snapCutout(
          poly,
          insideSurface,
          getNextCutoutId(),
        );
        onDrawDesignChange({
          ...drawDesign,
          cutouts: [...drawDesign.cutouts, cutout],
        });
      } else {
        const inferred = inferDrawnShape(poly);
        const points =
          inferred.snappedPoints && inferred.snappedPoints.length >= 3
            ? inferred.snappedPoints
            : poly;
        const newSurface = {
          id: getNextSurfaceId(),
          points,
          inferredShape: inferred,
        };
        onDrawDesignChange({
          ...drawDesign,
          surfaces: [...getDesignSurfaces(drawDesign), newSurface],
        });
      }
      setCurrentStroke(null);
      if (onEditPreviewChange) onEditPreviewChange(null);
    },
    [
      drawDesign,
      onDrawDesignChange,
      onEditPreviewChange,
      getNextCutoutId,
      getNextSurfaceId,
    ],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const { mx, my } = coords;
      const world = fromCanvas(mx, my);

      if (isDrawMode && drawDesign) {
        e.preventDefault();
        e.stopPropagation();
        const snapped = {
          x: snapToInch(world.x),
          y: snapToInch(world.y),
        };
        setCurrentStroke([snapped]);
        if (onEditPreviewChange) onEditPreviewChange(null);
        setLiveCutoutPreview(null);
        return;
      }

      for (let i = pieces.length - 1; i >= 0; i--) {
        const piece = pieces[i];
        const pts = transformPolygon(
          pieceToPolygon(piece),
          piece.position,
          piece.rotation,
        );
        const canvasPts = pts.map(toCanvas);
        if (pointInPolygon(mx, my, canvasPts)) {
          setDraggingId(piece.id);
          setDragStart({ x: mx, y: my });
          onSelectId(piece.id);
          return;
        }
      }
      onSelectId(null);
    },
    [
      pieces,
      fromCanvas,
      toCanvas,
      getCanvasCoords,
      onSelectId,
      isDrawMode,
      drawDesign,
      onDrawDesignChange,
      onEditPreviewChange,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const { mx, my } = coords;
      const world = fromCanvas(mx, my);

      if (isDrawMode && e.buttons !== 0) {
        e.preventDefault();
      }

      if (currentStroke != null && currentStroke.length > 0) {
        const last = currentStroke[currentStroke.length - 1];
        const snapped = {
          x: snapToInch(world.x),
          y: snapToInch(world.y),
        };
        const dist = Math.hypot(snapped.x - last.x, snapped.y - last.y);
        if (dist >= MIN_STROKE_DIST_INCH) {
          setCurrentStroke((prev) => (prev ? [...prev, snapped] : [snapped]));
        }
        return;
      }

      if (draggingId && dragStart) {
        const dx = mx - dragStart.x;
        const dy = my - dragStart.y;
        updatePiecePosition(draggingId, dx, dy);
        setDragStart({ x: mx, y: my });
      }
    },
    [
      draggingId,
      dragStart,
      updatePiecePosition,
      isDrawMode,
      getCanvasCoords,
      fromCanvas,
      currentStroke,
    ],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (currentStroke != null && currentStroke.length >= 2) {
        finishStroke(currentStroke);
      }
      setCurrentStroke(null);
      setDraggingId(null);
      setDragStart(null);
    },
    [currentStroke, finishStroke],
  );

  const handleMouseLeave = useCallback(() => {
    if (currentStroke != null && currentStroke.length >= 2) {
      finishStroke(currentStroke);
    }
    setCurrentStroke(null);
    setDraggingId(null);
    setDragStart(null);
  }, [currentStroke, finishStroke]);

  const handleApplyEdit = useCallback(() => {
    if (
      !editPreview ||
      editPreview.type !== "edit" ||
      !drawDesign ||
      !onDrawDesignChange
    )
      return;
    const hasInferredResult =
      editPreview.inferredEdit?.resultingPolygon &&
      editPreview.inferredEdit.resultingPolygon.length >= 3;
    const canReplaceSegment =
      editPreview.edgeIndices.length >= 2 && editPreview.strokePoints.length >= 2;
    if (!hasInferredResult && !canReplaceSegment) return;

    const surfaces = getDesignSurfaces(drawDesign);
    const si = editPreview.surfaceIndex;
    if (si < 0 || si >= surfaces.length) return;

    const newPoints = hasInferredResult
      ? editPreview.inferredEdit!.resultingPolygon
      : replaceOutlineSegmentWithStroke(
          surfaces[si].points,
          editPreview.strokePoints,
          editPreview.edgeIndices,
        );

    const next = [...surfaces];
    next[si] = {
      ...next[si],
      points: newPoints,
      inferredShape: undefined,
    };
    onDrawDesignChange({ ...drawDesign, surfaces: next });
    if (onEditPreviewChange) onEditPreviewChange(null);
  }, [
    editPreview,
    drawDesign,
    onDrawDesignChange,
    onEditPreviewChange,
  ]);

  const handleCancelEdit = useCallback(() => {
    if (onEditPreviewChange) onEditPreviewChange(null);
  }, [onEditPreviewChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 50; i++) {
      const g = GRID * PIXELS_PER_INCH;
      ctx.beginPath();
      ctx.moveTo(40 + i * g, 0);
      ctx.lineTo(40 + i * g, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 400 - i * g);
      ctx.lineTo(w, 400 - i * g);
      ctx.stroke();
    }

    if (isDrawMode && drawDesign) {
      const surfaces = getDesignSurfaces(drawDesign);
      surfaces.forEach((surface, idx) => {
        const outline = surface.points;
        if (outline.length < 3) return;
        const canvasPts = outline.map(toCanvas);
        ctx.beginPath();
        ctx.moveTo(canvasPts[0].x, canvasPts[0].y);
        for (let i = 1; i < canvasPts.length; i++) {
          ctx.lineTo(canvasPts[i].x, canvasPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
        ctx.fill();
        const edgeSet =
          editPreview?.type === "edit" && editPreview.surfaceIndex === idx
            ? new Set(editPreview.edgeIndices)
            : null;
        for (let i = 0; i < outline.length; i++) {
          const p1 = toCanvas(outline[i]);
          const p2 = toCanvas(outline[(i + 1) % outline.length]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = edgeSet?.has(i) ? "#16a34a" : "#475569";
          ctx.lineWidth = edgeSet?.has(i) ? 4 : 2;
          ctx.stroke();
        }
      });
      if (editPreview?.type === "edit") {
        const previewPolygon =
          editPreview.inferredEdit?.resultingPolygon &&
          editPreview.inferredEdit.resultingPolygon.length >= 3
            ? editPreview.inferredEdit.resultingPolygon
            : editPreview.strokePolygon;
        if (previewPolygon.length >= 3) {
          const previewPts = previewPolygon.map(toCanvas);
          ctx.beginPath();
          ctx.moveTo(previewPts[0].x, previewPts[0].y);
          for (let i = 1; i < previewPts.length; i++) {
            ctx.lineTo(previewPts[i].x, previewPts[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(14, 165, 233, 0.2)";
          ctx.fill();
          ctx.strokeStyle = "#0ea5e9";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      if (liveCutoutPreview != null && liveCutoutPreview.cutout.snappedRect) {
        const rect = liveCutoutPreview.cutout.snappedRect;
        const pts = [
          { x: rect.x, y: rect.y },
          { x: rect.x + rect.w, y: rect.y },
          { x: rect.x + rect.w, y: rect.y + rect.h },
          { x: rect.x, y: rect.y + rect.h },
        ];
        const canvasPts = pts.map(toCanvas);
        ctx.beginPath();
        ctx.moveTo(canvasPts[0].x, canvasPts[0].y);
        for (let i = 1; i < canvasPts.length; i++) {
          ctx.lineTo(canvasPts[i].x, canvasPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
        ctx.fill();
        ctx.strokeStyle = "#16a34a";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (
        currentStroke != null &&
        currentStroke.length >= 2 &&
        editPreview?.type !== "edit"
      ) {
        const previewPoly = strokeToPolygon(
          currentStroke,
          STROKE_TOLERANCE_INCHES,
        );
        if (previewPoly.length >= 3 && !liveCutoutPreview) {
          const inferred = inferDrawnShape(previewPoly);
          const previewPts =
            inferred.snappedPoints && inferred.snappedPoints.length >= 3
              ? inferred.snappedPoints.map(toCanvas)
              : previewPoly.map(toCanvas);
          ctx.beginPath();
          ctx.moveTo(previewPts[0].x, previewPts[0].y);
          for (let i = 1; i < previewPts.length; i++) {
            ctx.lineTo(previewPts[i].x, previewPts[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(14, 165, 233, 0.25)";
          ctx.fill();
          ctx.strokeStyle = "#0284c7";
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      drawDesign.cutouts.forEach((cut) => {
        const rect = cut.snappedRect;
        const pts = rect
          ? [
              { x: rect.x, y: rect.y },
              { x: rect.x + rect.w, y: rect.y },
              { x: rect.x + rect.w, y: rect.y + rect.h },
              { x: rect.x, y: rect.y + rect.h },
            ]
          : cut.points;
        if (pts.length < 3) return;
        const canvasPts = pts.map(toCanvas);
        ctx.beginPath();
        ctx.moveTo(canvasPts[0].x, canvasPts[0].y);
        for (let i = 1; i < canvasPts.length; i++) {
          ctx.lineTo(canvasPts[i].x, canvasPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(241, 245, 249, 0.9)";
        ctx.fill();
        ctx.strokeStyle = "#94a3b8";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      if (
        currentStroke != null &&
        currentStroke.length >= 2 &&
        editPreview?.type !== "edit"
      ) {
        const canvasPts = currentStroke.map(toCanvas);
        ctx.beginPath();
        ctx.moveTo(canvasPts[0].x, canvasPts[0].y);
        for (let i = 1; i < canvasPts.length; i++) {
          ctx.lineTo(canvasPts[i].x, canvasPts[i].y);
        }
        ctx.strokeStyle = "#0ea5e9";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    if (!isDrawMode) {
      pieces.forEach((piece) => {
        const pts = transformPolygon(
          pieceToPolygon(piece),
          piece.position,
          piece.rotation,
        );
        const canvasPts = pts.map(toCanvas);
        const isSelected = piece.id === selectedId;

        ctx.beginPath();
        ctx.moveTo(canvasPts[0].x, canvasPts[0].y);
        for (let i = 1; i < canvasPts.length; i++) {
          ctx.lineTo(canvasPts[i].x, canvasPts[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = isSelected
          ? "rgba(59, 130, 246, 0.35)"
          : "rgba(148, 163, 184, 0.4)";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#2563eb" : "#64748b";
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        if (isSelected) {
          const cx =
            canvasPts.reduce((s, p) => s + p.x, 0) / canvasPts.length;
          const cy =
            canvasPts.reduce((s, p) => s + p.y, 0) / canvasPts.length;
          ctx.fillStyle = "#2563eb";
          ctx.beginPath();
          ctx.arc(cx + 20, cy, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }
  }, [
    pieces,
    selectedId,
    toCanvas,
    isDrawMode,
    drawDesign,
    currentStroke,
    editPreview,
    liveCutoutPreview,
  ]);

  const strokeLengths =
    currentStroke != null && currentStroke.length >= 2
      ? (() => {
          let total = 0;
          const segs: number[] = [];
          for (let i = 1; i < currentStroke.length; i++) {
            const d = Math.hypot(
              currentStroke[i].x - currentStroke[i - 1].x,
              currentStroke[i].y - currentStroke[i - 1].y,
            );
            segs.push(d);
            total += d;
          }
          return { last: segs[segs.length - 1] ?? 0, total, segments: segs };
        })()
      : null;

  const livePreviewLabel =
    currentStroke != null && currentStroke.length >= 3
      ? (() => {
          const poly = strokeToPolygon(
            currentStroke,
            STROKE_TOLERANCE_INCHES,
          );
          return poly.length >= 3 ? inferDrawnShape(poly).label : null;
        })()
      : null;

  const totalSqFt =
    isDrawMode && drawDesign
      ? sqInToSqFt(drawDesignNetAreaSqIn(drawDesign))
      : pieces.reduce(
          (sum, p) =>
            sum +
            sqInToSqFt(
              polygonAreaSqIn(
                transformPolygon(
                  pieceToPolygon(p),
                  p.position,
                  p.rotation,
                ),
              ),
            ),
          0,
        );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-slate-900">2D Layout</h3>
        <span className="text-xs text-slate-500">
          {totalSqFt.toFixed(1)} sq ft
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        {isDrawMode
          ? "Click and drag to draw (snaps to 1\"). Release to add a surface or cutout; crossing a line enters edit mode."
          : "Drag countertops to position. Select in list to edit dimensions."}
      </p>
      <div className="relative inline-block">
        <canvas
        ref={canvasRef}
        width={500}
        height={450}
        className={`border border-slate-200 rounded-lg w-full max-w-[500px] select-none ${
          isDrawMode ? "cursor-crosshair" : "cursor-move"
        }`}
        style={{ touchAction: "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      </div>
      {isDrawMode && editPreview?.type === "edit" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
          <button
            type="button"
            onClick={handleApplyEdit}
            className="px-3 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:pointer-events-none font-medium"
            disabled={
              !(
                (editPreview.inferredEdit?.resultingPolygon &&
                  editPreview.inferredEdit.resultingPolygon.length >= 3) ||
                editPreview.edgeIndices.length >= 2
              )
            }
          >
            Apply edit
          </button>
          <button
            type="button"
            onClick={handleCancelEdit}
            className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium"
          >
            Cancel
          </button>
          {editPreview.inferredEdit?.label ? (
            <span className="text-slate-600 font-medium">
              {editPreview.inferredEdit.label}
            </span>
          ) : (
            <span className="text-slate-500">
              Highlighted segments will be replaced by your stroke
            </span>
          )}
        </div>
      )}
      {isDrawMode && (strokeLengths != null || livePreviewLabel) && editPreview?.type !== "edit" && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
          {strokeLengths != null && (
            <span>Total: {strokeLengths.total.toFixed(0)}"</span>
          )}
          {livePreviewLabel != null && (
            <span className="text-sky-700">Preview: {livePreviewLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
