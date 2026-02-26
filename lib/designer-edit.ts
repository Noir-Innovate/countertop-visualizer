import type { LayoutPoint } from "./designer-types";
import type { InferredEdit, SurfaceEditType } from "./designer-types";
import { SNAP_GRID_INCH } from "./designer-types";
import { avgDistanceToPolygon } from "./designer-drawn-shape";
import { replaceOutlineSegmentWithStroke } from "./designer-geometry";

const GRID = SNAP_GRID_INCH;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function normalize(p: LayoutPoint): LayoutPoint {
  const d = Math.hypot(p.x, p.y);
  if (d < 1e-9) return p;
  return { x: p.x / d, y: p.y / d };
}

/** Prev/next indices and unit vectors from corner toward prev and next. */
function cornerContext(
  polygon: LayoutPoint[],
  cornerIndex: number,
): {
  prev: LayoutPoint;
  curr: LayoutPoint;
  next: LayoutPoint;
  uBack: LayoutPoint;
  uForward: LayoutPoint;
} | null {
  const n = polygon.length;
  if (n < 3 || cornerIndex < 0 || cornerIndex >= n) return null;
  const prevIdx = (cornerIndex - 1 + n) % n;
  const nextIdx = (cornerIndex + 1) % n;
  const prev = polygon[prevIdx];
  const curr = polygon[cornerIndex];
  const next = polygon[nextIdx];
  const back = { x: prev.x - curr.x, y: prev.y - curr.y };
  const forward = { x: next.x - curr.x, y: next.y - curr.y };
  const lenBack = Math.hypot(back.x, back.y);
  const lenForward = Math.hypot(forward.x, forward.y);
  if (lenBack < 1e-9 || lenForward < 1e-9) return null;
  return {
    prev,
    curr,
    next,
    uBack: { x: back.x / lenBack, y: back.y / lenBack },
    uForward: { x: forward.x / lenForward, y: forward.y / lenForward },
  };
}

/** Replace corner with two points at distance `size` along each edge (box cutout / chamfer). */
function buildBoxCutout(
  polygon: LayoutPoint[],
  cornerIndex: number,
  size: number,
): LayoutPoint[] {
  const ctx = cornerContext(polygon, cornerIndex);
  if (!ctx) return polygon;
  const d = Math.max(1, snap(size));
  const p1 = {
    x: snap(ctx.curr.x + ctx.uBack.x * d),
    y: snap(ctx.curr.y + ctx.uBack.y * d),
  };
  const p2 = {
    x: snap(ctx.curr.x + ctx.uForward.x * d),
    y: snap(ctx.curr.y + ctx.uForward.y * d),
  };
  const before = polygon.slice(0, cornerIndex);
  const after = polygon.slice(cornerIndex + 1);
  return [...before, p1, p2, ...after];
}

/** Replace corner with single point (midpoint of the two box-cut points). */
function buildCornerCut(
  polygon: LayoutPoint[],
  cornerIndex: number,
  size: number,
): LayoutPoint[] {
  const ctx = cornerContext(polygon, cornerIndex);
  if (!ctx) return polygon;
  const d = Math.max(1, snap(size));
  const p1 = {
    x: ctx.curr.x + ctx.uBack.x * d,
    y: ctx.curr.y + ctx.uBack.y * d,
  };
  const p2 = {
    x: ctx.curr.x + ctx.uForward.x * d,
    y: ctx.curr.y + ctx.uForward.y * d,
  };
  const mid = {
    x: snap((p1.x + p2.x) / 2),
    y: snap((p1.y + p2.y) / 2),
  };
  const before = polygon.slice(0, cornerIndex);
  const after = polygon.slice(cornerIndex + 1);
  return [...before, mid, ...after];
}

/** 45° chamfer: same as box with equal distance along both edges. */
function buildChamfer45(
  polygon: LayoutPoint[],
  cornerIndex: number,
  length: number,
): LayoutPoint[] {
  return buildBoxCutout(polygon, cornerIndex, length);
}

/** Angle between two unit vectors (radians). */
function angleBetween(u: LayoutPoint, v: LayoutPoint): number {
  const dot = u.x * v.x + u.y * v.y;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/** Replace corner with circular arc (round corner). */
function buildRoundCorner(
  polygon: LayoutPoint[],
  cornerIndex: number,
  radius: number,
): LayoutPoint[] {
  const ctx = cornerContext(polygon, cornerIndex);
  if (!ctx) return polygon;
  const r = Math.max(1, snap(radius));
  const halfAngle = angleBetween(ctx.uBack, ctx.uForward) / 2;
  if (halfAngle < 1e-6) return polygon;
  const cutLen = r / Math.tan(halfAngle);
  const p1 = {
    x: ctx.curr.x + ctx.uBack.x * cutLen,
    y: ctx.curr.y + ctx.uBack.y * cutLen,
  };
  const p2 = {
    x: ctx.curr.x + ctx.uForward.x * cutLen,
    y: ctx.curr.y + ctx.uForward.y * cutLen,
  };
  const bisector = normalize({
    x: ctx.uBack.x + ctx.uForward.x,
    y: ctx.uBack.y + ctx.uForward.y,
  });
  const centerDist = r / Math.sin(halfAngle);
  const center = {
    x: ctx.curr.x + bisector.x * centerDist,
    y: ctx.curr.y + bisector.y * centerDist,
  };
  let angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
  let angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
  let delta = angle2 - angle1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const arcPoints: LayoutPoint[] = [];
  const numArc = 10;
  for (let i = 1; i < numArc; i++) {
    const t = i / numArc;
    const a = angle1 + t * delta;
    arcPoints.push({
      x: snap(center.x + r * Math.cos(a)),
      y: snap(center.y + r * Math.sin(a)),
    });
  }
  const before = polygon.slice(0, cornerIndex);
  const after = polygon.slice(cornerIndex + 1);
  return [
    ...before,
    { x: snap(p1.x), y: snap(p1.y) },
    ...arcPoints,
    { x: snap(p2.x), y: snap(p2.y) },
    ...after,
  ];
}

/** Protruding curve: bulge outward (exterior arc). */
function buildProtrudingCurve(
  polygon: LayoutPoint[],
  cornerIndex: number,
  radius: number,
): LayoutPoint[] {
  const ctx = cornerContext(polygon, cornerIndex);
  if (!ctx) return polygon;
  const r = Math.max(1, snap(radius));
  const halfAngle = angleBetween(ctx.uBack, ctx.uForward) / 2;
  if (halfAngle < 1e-6) return polygon;
  const cutLen = r / Math.tan(halfAngle);
  const p1 = {
    x: ctx.curr.x + ctx.uBack.x * cutLen,
    y: ctx.curr.y + ctx.uBack.y * cutLen,
  };
  const p2 = {
    x: ctx.curr.x + ctx.uForward.x * cutLen,
    y: ctx.curr.y + ctx.uForward.y * cutLen,
  };
  const bisector = normalize({
    x: ctx.uBack.x + ctx.uForward.x,
    y: ctx.uBack.y + ctx.uForward.y,
  });
  const centerDist = r / Math.sin(halfAngle);
  const outwardBisector = { x: -bisector.x, y: -bisector.y };
  const center = {
    x: ctx.curr.x + outwardBisector.x * centerDist,
    y: ctx.curr.y + outwardBisector.y * centerDist,
  };
  let angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
  let angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
  let delta = angle2 - angle1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  delta = delta >= 0 ? delta - 2 * Math.PI : delta + 2 * Math.PI;
  const arcPoints: LayoutPoint[] = [];
  const numArc = 10;
  for (let i = 1; i < numArc; i++) {
    const t = i / numArc;
    const a = angle1 + t * delta;
    arcPoints.push({
      x: snap(center.x + r * Math.cos(a)),
      y: snap(center.y + r * Math.sin(a)),
    });
  }
  const before = polygon.slice(0, cornerIndex);
  const after = polygon.slice(cornerIndex + 1);
  return [
    ...before,
    { x: snap(p1.x), y: snap(p1.y) },
    ...arcPoints,
    { x: snap(p2.x), y: snap(p2.y) },
    ...after,
  ];
}

interface EditCandidate {
  editType: SurfaceEditType;
  label: string;
  params?: InferredEdit["params"];
  resultingPolygon: LayoutPoint[];
  error: number;
}

const BOX_SIZES = [2, 3, 4, 5, 6];
const CHAMFER_LENGTHS = [2, 3, 4, 5, 6];
const RADII = [2, 3, 4, 5, 6];

/**
 * Infer the best-fit surface edit from a stroke over a corner.
 * When cornerIndex is set, scores box_cutout, corner_cut, chamfer_45, round_corner, protruding_curve
 * (and optionally replace_segment if strokePoints and edgeIndices are provided).
 * Returns the candidate with lowest error.
 */
export function inferEdit(
  polygon: LayoutPoint[],
  strokePoints: LayoutPoint[],
  cornerIndex: number,
  options?: {
    strokePointsForReplace?: LayoutPoint[];
    edgeIndices?: number[];
  },
): InferredEdit {
  const candidates: EditCandidate[] = [];

  for (const size of BOX_SIZES) {
    const result = buildBoxCutout(polygon, cornerIndex, size);
    if (result.length >= 3) {
      candidates.push({
        editType: "box_cutout",
        label: "Box cutout",
        params: { size },
        resultingPolygon: result,
        error: avgDistanceToPolygon(strokePoints, result),
      });
    }
  }

  for (const size of BOX_SIZES) {
    const result = buildCornerCut(polygon, cornerIndex, size);
    if (result.length >= 3) {
      candidates.push({
        editType: "corner_cut",
        label: "Corner cut",
        params: { size },
        resultingPolygon: result,
        error: avgDistanceToPolygon(strokePoints, result),
      });
    }
  }

  for (const len of CHAMFER_LENGTHS) {
    const result = buildChamfer45(polygon, cornerIndex, len);
    if (result.length >= 3) {
      candidates.push({
        editType: "chamfer_45",
        label: "45° chamfer",
        params: { length: len },
        resultingPolygon: result,
        error: avgDistanceToPolygon(strokePoints, result),
      });
    }
  }

  for (const r of RADII) {
    const result = buildRoundCorner(polygon, cornerIndex, r);
    if (result.length >= 3) {
      candidates.push({
        editType: "round_corner",
        label: "Round corner",
        params: { radius: r },
        resultingPolygon: result,
        error: avgDistanceToPolygon(strokePoints, result),
      });
    }
  }

  for (const r of RADII) {
    const result = buildProtrudingCurve(polygon, cornerIndex, r);
    if (result.length >= 3) {
      candidates.push({
        editType: "protruding_curve",
        label: "Protruding curve",
        params: { radius: r },
        resultingPolygon: result,
        error: avgDistanceToPolygon(strokePoints, result),
      });
    }
  }

  if (
    options?.strokePointsForReplace &&
    options?.edgeIndices &&
    options.edgeIndices.length >= 2
  ) {
    const result = replaceOutlineSegmentWithStroke(
      polygon,
      options.strokePointsForReplace,
      options.edgeIndices,
    );
    if (result.length >= 3) {
      candidates.push({
        editType: "replace_segment",
        label: "Custom edge",
        resultingPolygon: result,
        error: avgDistanceToPolygon(strokePoints, result),
      });
    }
  }

  if (candidates.length === 0) {
    return {
      editType: "corner_cut",
      label: "Corner cut",
      resultingPolygon: polygon,
      cornerIndex,
    };
  }

  candidates.sort((a, b) => a.error - b.error);
  const best = candidates[0];
  return {
    editType: best.editType,
    label: best.label,
    cornerIndex,
    params: best.params,
    resultingPolygon: best.resultingPolygon,
  };
}
