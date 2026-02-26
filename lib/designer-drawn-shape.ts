import type { LayoutPoint } from "./designer-types";
import type {
  InferredDrawnShape,
  InferredDrawnShapeType,
} from "./designer-types";
import { polygonCentroid, SNAP_GRID_INCH } from "./designer-types";

function snap(v: number): number {
  return Math.round(v / SNAP_GRID_INCH) * SNAP_GRID_INCH;
}

function bbox(points: LayoutPoint[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

// ---- Error metric ----
// Average distance from each original point to the nearest edge of the candidate polygon.

export function distPointToSegment(
  p: LayoutPoint,
  a: LayoutPoint,
  b: LayoutPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distPointToPolygon(
  p: LayoutPoint,
  poly: LayoutPoint[],
): number {
  let min = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const d = distPointToSegment(p, poly[i], poly[(i + 1) % n]);
    if (d < min) min = d;
  }
  return min;
}

export function avgDistanceToPolygon(
  original: LayoutPoint[],
  candidate: LayoutPoint[],
): number {
  if (candidate.length < 3) return Infinity;
  let sum = 0;
  for (const p of original) {
    sum += distPointToPolygon(p, candidate);
  }
  return sum / original.length;
}

// ---- Candidate builders ----

interface ShapeCandidate {
  type: InferredDrawnShapeType;
  label: string;
  params?: InferredDrawnShape["params"];
  snappedPoints: LayoutPoint[];
  error: number;
}

function buildRectangle(points: LayoutPoint[]): ShapeCandidate {
  const { minX, w, minY, h } = bbox(points);
  const sw = Math.max(1, snap(w));
  const sh = Math.max(1, snap(h));
  const sx = snap(minX);
  const sy = snap(minY);
  const snappedPoints: LayoutPoint[] = [
    { x: sx, y: sy },
    { x: sx + sw, y: sy },
    { x: sx + sw, y: sy + sh },
    { x: sx, y: sy + sh },
  ];
  const aspect = Math.min(sw, sh) / Math.max(sw, sh);
  const isSquare = aspect >= 0.85;
  return {
    type: isSquare ? "square" : "rectangle",
    label: isSquare ? `Square ${Math.max(sw, sh)}"` : `Rectangle ${sw}×${sh}"`,
    params: { width: sw, depth: sh },
    snappedPoints,
    error: avgDistanceToPolygon(points, snappedPoints),
  };
}

/**
 * Build an L-shape by trying all 4 corner-notch orientations and a range of
 * cut-width / cut-height ratios, then picking the combination with lowest error.
 */
function buildLShape(points: LayoutPoint[]): ShapeCandidate {
  const { minX, minY, w, h } = bbox(points);
  const sx = snap(minX);
  const sy = snap(minY);
  const sw = Math.max(2, snap(w));
  const sh = Math.max(2, snap(h));

  const cutRatios = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

  let bestPoly: LayoutPoint[] | null = null;
  let bestError = Infinity;

  for (const corner of ["tl", "tr", "br", "bl"] as const) {
    for (const cwR of cutRatios) {
      for (const chR of cutRatios) {
        const cw = Math.max(1, snap(sw * cwR));
        const ch = Math.max(1, snap(sh * chR));
        if (cw >= sw || ch >= sh) continue;

        const poly = makeLPolygon(sx, sy, sw, sh, cw, ch, corner);
        const err = avgDistanceToPolygon(points, poly);
        if (err < bestError) {
          bestError = err;
          bestPoly = poly;
        }
      }
    }
  }

  if (!bestPoly) {
    bestPoly = makeLPolygon(
      sx,
      sy,
      sw,
      sh,
      snap(sw * 0.5),
      snap(sh * 0.5),
      "tr",
    );
    bestError = avgDistanceToPolygon(points, bestPoly);
  }

  return {
    type: "l",
    label: "L-shape",
    params: { width: sw, depth: sh },
    snappedPoints: bestPoly,
    error: bestError,
  };
}

function makeLPolygon(
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  cw: number,
  ch: number,
  corner: "tl" | "tr" | "br" | "bl",
): LayoutPoint[] {
  switch (corner) {
    case "tl":
      return [
        { x: sx + cw, y: sy },
        { x: sx + sw, y: sy },
        { x: sx + sw, y: sy + sh },
        { x: sx, y: sy + sh },
        { x: sx, y: sy + ch },
        { x: sx + cw, y: sy + ch },
      ];
    case "tr":
      return [
        { x: sx, y: sy },
        { x: sx + sw - cw, y: sy },
        { x: sx + sw - cw, y: sy + ch },
        { x: sx + sw, y: sy + ch },
        { x: sx + sw, y: sy + sh },
        { x: sx, y: sy + sh },
      ];
    case "br":
      return [
        { x: sx, y: sy },
        { x: sx + sw, y: sy },
        { x: sx + sw, y: sy + sh - ch },
        { x: sx + sw - cw, y: sy + sh - ch },
        { x: sx + sw - cw, y: sy + sh },
        { x: sx, y: sy + sh },
      ];
    case "bl":
      return [
        { x: sx, y: sy },
        { x: sx + sw, y: sy },
        { x: sx + sw, y: sy + sh },
        { x: sx + cw, y: sy + sh },
        { x: sx + cw, y: sy + sh - ch },
        { x: sx, y: sy + sh - ch },
      ];
  }
}

function buildCircle(points: LayoutPoint[]): ShapeCandidate {
  const c = polygonCentroid(points);
  let sumDist = 0;
  for (const p of points) {
    sumDist += Math.hypot(p.x - c.x, p.y - c.y);
  }
  const avgRadius = sumDist / points.length;
  const r = Math.max(1, snap(avgRadius));
  const snappedPoints = circleToPolygon(c.x, c.y, r, 32);
  return {
    type: "circle",
    label: `Circle ${r * 2}"`,
    params: { radius: r },
    snappedPoints,
    error: avgDistanceToPolygon(points, snappedPoints),
  };
}

function buildOval(points: LayoutPoint[]): ShapeCandidate {
  const { minX, maxX, minY, maxY, w, h } = bbox(points);
  const ax = Math.max(1, snap(w / 2));
  const by = Math.max(1, snap(h / 2));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const snappedPoints = ellipseToPolygon(cx, cy, ax, by, 32);
  return {
    type: "oval",
    label: `Oval ${ax * 2}×${by * 2}"`,
    params: { a: ax, b: by },
    snappedPoints,
    error: avgDistanceToPolygon(points, snappedPoints),
  };
}

// ---- Main entry ----

/**
 * Test all shape types against the drawn points, measure error for each,
 * and return the best fit. Never falls back to "polygon".
 */
export function inferDrawnShape(points: LayoutPoint[]): InferredDrawnShape {
  if (!points || points.length < 3) {
    return buildRectangle(points ?? []);
  }

  const candidates: ShapeCandidate[] = [
    buildRectangle(points),
    buildLShape(points),
    buildCircle(points),
    buildOval(points),
  ];

  candidates.sort((a, b) => a.error - b.error);
  const best = candidates[0];

  return {
    type: best.type,
    label: best.label,
    params: best.params,
    snappedPoints: best.snappedPoints,
  };
}

// ---- Shape polygon generators ----

function circleToPolygon(
  cx: number,
  cy: number,
  r: number,
  n: number,
): LayoutPoint[] {
  const out: LayoutPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i * 2 * Math.PI) / n;
    out.push({
      x: snap(cx + r * Math.cos(t)),
      y: snap(cy + r * Math.sin(t)),
    });
  }
  return out;
}

function ellipseToPolygon(
  cx: number,
  cy: number,
  a: number,
  b: number,
  n: number,
): LayoutPoint[] {
  const out: LayoutPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i * 2 * Math.PI) / n;
    out.push({
      x: snap(cx + a * Math.cos(t)),
      y: snap(cy + b * Math.sin(t)),
    });
  }
  return out;
}

export function snapPolygonToGrid(points: LayoutPoint[]): LayoutPoint[] {
  return points.map((p) => ({ x: snap(p.x), y: snap(p.y) }));
}
