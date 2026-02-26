import type { LayoutPoint } from "./designer-types";
import { pointInPolygon, polygonCentroid } from "./designer-types";
import { distPointToSegment } from "./designer-drawn-shape";

const EPS = 1e-9;

/** Max distance (inches) from stroke point to polygon edge to count as "hit" for edit detection. */
const STROKE_NEAR_EDGE_INCHES = 0.5;

export interface SegmentIntersection {
  x: number;
  y: number;
  tA: number;
  tB: number;
}

/**
 * Segment a1-a2 vs segment b1-b2.
 * Returns intersection point and parameters if they intersect (excluding endpoints only touching).
 */
export function segmentIntersectSegment(
  a1: LayoutPoint,
  a2: LayoutPoint,
  b1: LayoutPoint,
  b2: LayoutPoint,
): SegmentIntersection | null {
  const ax = a2.x - a1.x;
  const ay = a2.y - a1.y;
  const bx = b2.x - b1.x;
  const by = b2.y - b1.y;
  const cx = a1.x - b1.x;
  const cy = a1.y - b1.y;
  const cross = ax * by - ay * bx;
  if (Math.abs(cross) < EPS) return null;
  const tA = (bx * cy - by * cx) / cross;
  const tB = (ax * cy - ay * cx) / cross;
  if (tA <= EPS || tA >= 1 - EPS || tB <= EPS || tB >= 1 - EPS) return null;
  return {
    x: a1.x + tA * ax,
    y: a1.y + tA * ay,
    tA,
    tB,
  };
}

export function segmentIntersectsSegment(
  a1: LayoutPoint,
  a2: LayoutPoint,
  b1: LayoutPoint,
  b2: LayoutPoint,
): boolean {
  return segmentIntersectSegment(a1, a2, b1, b2) != null;
}

/**
 * Which polygon edges (by index) does the stroke intersect?
 * Also counts an edge as "hit" if any stroke point is within STROKE_NEAR_EDGE_INCHES of it.
 */
export function strokeIntersectsPolygon(
  stroke: LayoutPoint[],
  polygon: LayoutPoint[],
): number[] {
  const hit = new Set<number>();
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    for (let j = 0; j < stroke.length - 1; j++) {
      if (segmentIntersectsSegment(stroke[j], stroke[j + 1], p1, p2)) {
        hit.add(i);
        break;
      }
    }
    if (hit.has(i)) continue;
    for (const p of stroke) {
      if (distPointToSegment(p, p1, p2) < STROKE_NEAR_EDGE_INCHES) {
        hit.add(i);
        break;
      }
    }
  }
  return [...hit];
}

/**
 * True if polygon P is considered "inside" the outline (centroid inside).
 */
export function polygonInsidePolygon(
  inner: LayoutPoint[],
  outline: LayoutPoint[],
): boolean {
  if (inner.length < 3 || outline.length < 3) return false;
  const c = polygonCentroid(inner);
  return pointInPolygon(c.x, c.y, outline);
}

/**
 * Find intersection points of stroke with polygon, in order along the stroke.
 * Returns array of { edgeIndex, point }.
 */
export function strokePolygonIntersectionPoints(
  stroke: LayoutPoint[],
  polygon: LayoutPoint[],
): { edgeIndex: number; point: LayoutPoint }[] {
  const out: { edgeIndex: number; point: LayoutPoint }[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    for (let j = 0; j < stroke.length - 1; j++) {
      const isec = segmentIntersectSegment(stroke[j], stroke[j + 1], p1, p2);
      if (isec) {
        out.push({
          edgeIndex: i,
          point: { x: isec.x, y: isec.y },
        });
      }
    }
  }
  return out;
}

/**
 * If the stroke hit exactly two adjacent polygon edges, return the vertex index
 * (the "corner") between them. Otherwise return null.
 */
export function getCornerFromHitEdges(
  edgeIndices: number[],
  polygon: LayoutPoint[],
): number | null {
  const n = polygon.length;
  if (n < 3 || edgeIndices.length !== 2) return null;
  const [e1, e2] = [...edgeIndices].sort((a, b) => a - b);
  const adjacent = e2 === e1 + 1 || (e1 === 0 && e2 === n - 1);
  if (!adjacent) return null;
  return e2 === e1 + 1 ? e2 : 0;
}

/**
 * Replace the outline segment between the first two intersection points with the stroke.
 * v1: assume exactly two distinct intersection points; stroke runs between them.
 * Returns new outline polygon: outline[0..e1], isec1, stroke, isec2, outline[e2+1..n-1].
 */
export function replaceOutlineSegmentWithStroke(
  outline: LayoutPoint[],
  stroke: LayoutPoint[],
  intersectedEdgeIndices: number[],
): LayoutPoint[] {
  if (outline.length < 3 || stroke.length < 2) return outline;
  const points = strokePolygonIntersectionPoints(stroke, outline);
  if (points.length < 2) return outline;

  const byEdge = new Map<number, LayoutPoint[]>();
  for (const { edgeIndex, point } of points) {
    if (!byEdge.has(edgeIndex)) byEdge.set(edgeIndex, []);
    byEdge.get(edgeIndex)!.push(point);
  }
  const edges = [...byEdge.keys()].sort((a, b) => a - b);
  if (edges.length < 2) return outline;

  const e1 = edges[0];
  const e2 = edges[1];
  const isec1 = byEdge.get(e1)![0];
  const isec2 = byEdge.get(e2)![0];

  const newOutline: LayoutPoint[] = [];
  const n = outline.length;
  for (let i = 0; i <= e1; i++) {
    newOutline.push({ ...outline[i] });
  }
  newOutline.push({ ...isec1 });
  for (const p of stroke) {
    newOutline.push({ ...p });
  }
  newOutline.push({ ...isec2 });
  for (let i = e2 + 1; i < n; i++) {
    newOutline.push({ ...outline[i] });
  }
  return newOutline;
}
