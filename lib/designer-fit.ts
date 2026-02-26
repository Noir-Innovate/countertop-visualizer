import type { LayoutPoint } from "./designer-types";
import { type CanonicalShape, polygonAreaSqIn } from "./designer-types";

const RECTANGLE_TOLERANCE = 0.95; // outline area / bbox area > this => treat as rect
const MIN_EDGE_INCH = 6;

/**
 * Infer a canonical shape (rectangle, L, T, or polygon) from a drawn outline.
 * Used for quoting and cabinet runs.
 */
export function inferCanonicalShape(outline: LayoutPoint[]): CanonicalShape {
  if (!outline || outline.length < 3) {
    return { type: "polygon", params: { points: outline || [] } };
  }

  const area = polygonAreaSqIn(outline);
  if (area < 1) return { type: "polygon", params: { points: outline } };

  const bbox = getAxisAlignedBBox(outline);
  const bboxArea = bbox.w * bbox.h;
  const areaRatio = bboxArea > 0 ? area / bboxArea : 0;

  // Nearly rectangular (4 points and fills bbox)
  if (outline.length === 4 && areaRatio >= RECTANGLE_TOLERANCE) {
    return {
      type: "rectangle",
      params: { width: bbox.w, depth: bbox.h },
    };
  }

  // Try rectangle for any convex-ish shape that fills the bbox
  if (areaRatio >= RECTANGLE_TOLERANCE) {
    return {
      type: "rectangle",
      params: { width: bbox.w, depth: bbox.h },
    };
  }

  // Try L-shape: two dominant perpendicular legs
  const lFit = tryFitL(outline, bbox);
  if (lFit) return lFit;

  // Try T-shape: stem + two arms
  const tFit = tryFitT(outline, bbox);
  if (tFit) return tFit;

  return { type: "polygon", params: { points: outline } };
}

function getAxisAlignedBBox(points: LayoutPoint[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
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
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function tryFitL(
  outline: LayoutPoint[],
  bbox: { w: number; h: number },
): CanonicalShape | null {
  const n = outline.length;
  if (n < 5 || n > 10) return null;

  const area = polygonAreaSqIn(outline);
  const rectArea = bbox.w * bbox.h;
  if (rectArea < 1) return null;
  const fillRatio = area / rectArea;
  if (fillRatio < 0.3 || fillRatio > 0.95) return null;

  // Simple L: assume main run along longer axis, leg along shorter
  const mainRun = Math.max(bbox.w, bbox.h);
  const mainDepth = Math.min(bbox.w, bbox.h);
  const legWidth = Math.min(24, mainDepth * 0.5);
  const legDepth = mainRun * 0.4;

  return {
    type: "l",
    params: {
      width: mainRun,
      depth: mainDepth,
      legWidth,
      legDepth,
    },
  };
}

function tryFitT(
  outline: LayoutPoint[],
  bbox: { w: number; h: number },
): CanonicalShape | null {
  const n = outline.length;
  if (n < 6 || n > 12) return null;

  const area = polygonAreaSqIn(outline);
  const rectArea = bbox.w * bbox.h;
  if (rectArea < 1) return null;
  const fillRatio = area / rectArea;
  if (fillRatio < 0.3 || fillRatio > 0.95) return null;

  const stemW = Math.max(bbox.w, bbox.h);
  const stemD = Math.min(bbox.w, bbox.h);
  const armW = stemW * 0.25;
  const armD = stemD * 0.4;

  return {
    type: "t",
    params: {
      width: stemW,
      depth: stemD,
      armWidth: armW,
      armDepth: armD,
    },
  };
}

/**
 * Return cabinet run lengths for the outline (edge lengths).
 * Used when we need runs from the actual polygon (e.g. generic polygon).
 */
export function getCabinetRunsFromOutline(outline: LayoutPoint[]): number[] {
  const runs: number[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const p1 = outline[i];
    const p2 = outline[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len >= MIN_EDGE_INCH) runs.push(len);
  }
  return runs;
}
