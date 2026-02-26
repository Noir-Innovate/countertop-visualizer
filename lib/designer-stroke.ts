import type { LayoutPoint } from "./designer-types";
import { polygonAreaSqIn } from "./designer-types";

const MIN_STROKE_POINTS = 3;
const MIN_POLYGON_AREA_SQIN = 1;

/**
 * Ramer-Douglas-Peucker polyline simplification (in-house implementation).
 * For production-grade accuracy and speed, consider using the Rust `geo` crate
 * (geo::algorithm::simplify) compiled to WASM via wasm-pack and calling from JS.
 */
export function simplifyPolyline(
  points: LayoutPoint[],
  tolerance: number,
): LayoutPoint[] {
  if (points.length <= 2) return points.length ? [...points] : [];
  const tolSq = tolerance * tolerance;

  function perpendicularDistance(
    p: LayoutPoint,
    a: LayoutPoint,
    b: LayoutPoint,
  ): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) {
      return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return (p.x - projX) ** 2 + (p.y - projY) ** 2;
  }

  function rdp(start: number, end: number): LayoutPoint[] {
    if (end <= start + 1) {
      return [points[start], points[end]];
    }
    let maxDistSq = 0;
    let maxIdx = start;
    const a = points[start];
    const b = points[end];
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], a, b);
      if (d > maxDistSq) {
        maxDistSq = d;
        maxIdx = i;
      }
    }
    if (maxDistSq <= tolSq) {
      return [points[start], points[end]];
    }
    const left = rdp(start, maxIdx);
    const right = rdp(maxIdx, end);
    return [...left.slice(0, -1), ...right];
  }

  const simplified = rdp(0, points.length - 1);
  return simplified;
}

const GRID = 1;

/**
 * Simplify polyline until it has at most targetPoints points (by increasing RDP tolerance).
 * Used to get ~6 points for an L-shape before orthogonalizing.
 */
export function simplifyPolylineToSize(
  points: LayoutPoint[],
  targetPoints: number,
  minTolerance: number = 0.1,
  maxTolerance: number = 50,
): LayoutPoint[] {
  if (points.length <= targetPoints) return [...points];
  let low = minTolerance;
  let high = maxTolerance;
  let best = points;
  for (let i = 0; i < 20; i++) {
    const tol = (low + high) / 2;
    const out = simplifyPolyline(points, tol);
    if (out.length <= targetPoints) {
      best = out;
      high = tol;
    } else {
      low = tol;
    }
  }
  return best;
}

/**
 * Orthogonalize a polygon so all edges are axis-aligned (90° angles).
 * For each edge, the dominant direction (H or V) is preserved and the
 * target coordinate from the original point is used — NOT the diagonal length.
 */
export function orthogonalizePolygon(points: LayoutPoint[]): LayoutPoint[] {
  const n = points.length;
  if (n < 3) return points;

  const grid = (v: number) => Math.round(v / GRID) * GRID;

  const out: LayoutPoint[] = [];
  let x = grid(points[0].x);
  let y = grid(points[0].y);
  out.push({ x, y });

  for (let i = 0; i < n - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) continue;
    if (Math.abs(dx) >= Math.abs(dy)) {
      x = grid(b.x);
    } else {
      y = grid(b.y);
    }
    const prev = out[out.length - 1];
    if (prev.x !== x || prev.y !== y) {
      out.push({ x, y });
    }
  }

  const first = out[0];
  const last = out[out.length - 1];
  if (last.x !== first.x && last.y !== first.y) {
    const closeDx = first.x - last.x;
    const closeDy = first.y - last.y;
    if (Math.abs(closeDy) >= Math.abs(closeDx)) {
      out.push({ x: last.x, y: first.y });
    } else {
      out.push({ x: first.x, y: last.y });
    }
  }

  if (
    out.length >= 2 &&
    out[0].x === out[out.length - 1].x &&
    out[0].y === out[out.length - 1].y
  ) {
    out.pop();
  }
  return out.length >= 3 ? out : points;
}

/**
 * Close stroke (first point appended) and simplify with RDP.
 * Returns closed polygon or empty if stroke too short or area too small.
 */
export function strokeToPolygon(
  points: LayoutPoint[],
  toleranceInches: number,
): LayoutPoint[] {
  if (points.length < MIN_STROKE_POINTS) return [];
  const closed = [...points];
  if (
    Math.hypot(
      closed[closed.length - 1].x - closed[0].x,
      closed[closed.length - 1].y - closed[0].y,
    ) > 1e-6
  ) {
    closed.push({ ...closed[0] });
  }
  const simplified = simplifyPolyline(closed, toleranceInches);
  if (simplified.length < 3) return [];
  const n = simplified.length;
  const last = simplified[n - 1];
  const first = simplified[0];
  const poly =
    Math.hypot(last.x - first.x, last.y - first.y) < 1e-6
      ? simplified
      : [...simplified, { ...first }];
  const area = polygonAreaSqIn(poly);
  if (area < MIN_POLYGON_AREA_SQIN) return [];
  return poly;
}
