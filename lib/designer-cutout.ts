import type { LayoutPoint } from "./designer-types";
import {
  type Cutout,
  type CutoutRect,
  type CutoutType,
  CUTOUT_GRID_INCH,
  STANDARD_CUTOUT_SIZES,
  pointInPolygon,
  polygonCentroid,
  polygonAreaSqIn,
} from "./designer-types";
import { distPointToSegment } from "./designer-drawn-shape";

/** Minimum distance (inches) cutout must be inset from the outline edge. */
export const CUTOUT_MIN_INSET_INCHES = 4;

function rectInsideOutline(rect: CutoutRect, outline: LayoutPoint[]): boolean {
  const corners: LayoutPoint[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  return corners.every((c) => pointInPolygon(c.x, c.y, outline));
}

/**
 * Minimum distance from rect to any edge of the polygon, and the closest point on the polygon.
 */
function minDistanceRectToPolygon(
  rect: CutoutRect,
  polygon: LayoutPoint[],
): { distance: number; closestPolyPoint: LayoutPoint } {
  const corners: LayoutPoint[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  let minDist = Infinity;
  let closestPolyPoint = polygon[0];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    for (const c of corners) {
      const d = distPointToSegment(c, a, b);
      if (d < minDist) {
        minDist = d;
        let t =
          lenSq < 1e-12 ? 0 : ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        closestPolyPoint = { x: a.x + t * dx, y: a.y + t * dy };
      }
    }
  }
  return { distance: minDist, closestPolyPoint };
}

function snapToGrid(v: number, grid: number): number {
  return Math.round(v / grid) * grid;
}

/**
 * Snap drawn polygon to nearest standard cutout size and 1" grid.
 * Returns a Cutout with raw points and snappedRect (for area and display).
 */
export function snapCutout(
  drawnPoints: LayoutPoint[],
  outline: LayoutPoint[],
  id: string,
): Cutout {
  if (drawnPoints.length < 3) {
    return {
      id,
      type: "custom",
      points: drawnPoints,
    };
  }

  const area = polygonAreaSqIn(drawnPoints);
  const centroid = polygonCentroid(drawnPoints);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of drawnPoints) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const drawnW = maxX - minX;
  const drawnH = maxY - minY;

  // Find nearest standard size, testing both orientations (horizontal and vertical)
  let best = STANDARD_CUTOUT_SIZES[0];
  let bestScore = Infinity;
  let bestRotated = false;
  for (const std of STANDARD_CUTOUT_SIZES) {
    // Horizontal (standard orientation)
    const areaDiffH = Math.abs(std.w * std.h - area);
    const whDiffH = Math.abs(std.w - drawnW) + Math.abs(std.h - drawnH);
    const scoreH = areaDiffH + whDiffH * 2;

    // Vertical (rotated 90°)
    const areaDiffV = Math.abs(std.h * std.w - area);
    const whDiffV = Math.abs(std.h - drawnW) + Math.abs(std.w - drawnH);
    const scoreV = areaDiffV + whDiffV * 2;

    if (scoreH <= scoreV && scoreH < bestScore) {
      bestScore = scoreH;
      best = std;
      bestRotated = false;
    } else if (scoreV < scoreH && scoreV < bestScore) {
      bestScore = scoreV;
      best = std;
      bestRotated = true;
    }
  }

  const w = bestRotated ? best.h : best.w;
  const h = bestRotated ? best.w : best.h;

  // Snap center to grid; rect origin = center - (w/2, h/2)
  const cx = snapToGrid(centroid.x, CUTOUT_GRID_INCH);
  const cy = snapToGrid(centroid.y, CUTOUT_GRID_INCH);
  let x = cx - w / 2;
  let y = cy - h / 2;

  // Clamp so rect stays inside outline (nudge if needed)
  const outlineBbox = outline.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      maxX: Math.max(acc.maxX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  x = Math.max(outlineBbox.minX, Math.min(outlineBbox.maxX - w, x));
  y = Math.max(outlineBbox.minY, Math.min(outlineBbox.maxY - h, y));

  const snappedRect: CutoutRect = { x, y, w, h };

  // If snapped rect is not fully inside outline, nudge along grid
  if (!rectInsideOutline(snappedRect, outline)) {
    const step = CUTOUT_GRID_INCH;
    const deltas = [0, step, -step, 2 * step, -2 * step];
    outer: for (const dx of deltas) {
      for (const dy of deltas) {
        const r: CutoutRect = { x: x + dx, y: y + dy, w, h };
        if (rectInsideOutline(r, outline)) {
          snappedRect.x = r.x;
          snappedRect.y = r.y;
          break outer;
        }
      }
    }
  }

  // Enforce minimum inset from outline edge (e.g. 4")
  for (let iter = 0; iter < 20; iter++) {
    const { distance, closestPolyPoint } = minDistanceRectToPolygon(
      snappedRect,
      outline,
    );
    if (distance >= CUTOUT_MIN_INSET_INCHES) break;
    const cx = snappedRect.x + snappedRect.w / 2;
    const cy = snappedRect.y + snappedRect.h / 2;
    const nx = closestPolyPoint.x;
    const ny = closestPolyPoint.y;
    const dx = cx - nx;
    const dy = cy - ny;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) break;
    const nudge =
      ((CUTOUT_MIN_INSET_INCHES - distance) / len) * Math.min(len, 2);
    const newCx = cx + (dx / len) * nudge;
    const newCy = cy + (dy / len) * nudge;
    let newX = snapToGrid(newCx - w / 2, CUTOUT_GRID_INCH);
    let newY = snapToGrid(newCy - h / 2, CUTOUT_GRID_INCH);
    newX = Math.max(outlineBbox.minX, Math.min(outlineBbox.maxX - w, newX));
    newY = Math.max(outlineBbox.minY, Math.min(outlineBbox.maxY - h, newY));
    const next: CutoutRect = { x: newX, y: newY, w, h };
    if (!rectInsideOutline(next, outline)) break;
    snappedRect.x = next.x;
    snappedRect.y = next.y;
  }

  return {
    id,
    type: best.type as CutoutType,
    points: drawnPoints,
    snappedRect,
  };
}
