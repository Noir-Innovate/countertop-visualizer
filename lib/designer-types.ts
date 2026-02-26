// Designer layout and quote types

export interface LayoutPoint {
  x: number; // inches
  y: number;
}

export interface LayoutPolygon {
  points: LayoutPoint[];
  depth: number; // countertop depth in inches (default 24)
}

// ---- Draw-based 2D designer ----

export type CutoutType =
  | "sink_single"
  | "sink_double"
  | "cooktop"
  | "custom";

export interface CutoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Cutout {
  id: string;
  type: CutoutType;
  points: LayoutPoint[];
  snappedRect?: CutoutRect;
}

// Inferred shape for a drawn surface (rectangle, square, L, oval, circle)
export type InferredDrawnShapeType =
  | "rectangle"
  | "square"
  | "l"
  | "oval"
  | "circle"
  | "polygon";

export interface InferredDrawnShape {
  type: InferredDrawnShapeType;
  label: string;
  params?: { width?: number; depth?: number; radius?: number; a?: number; b?: number };
  snappedPoints?: LayoutPoint[]; // canonical polygon for the shape (1" grid)
}

export interface Surface {
  id: string;
  points: LayoutPoint[];
  inferredShape?: InferredDrawnShape;
}

// ---- Surface edit (draw-over to apply) ----

export type SurfaceEditType =
  | "box_cutout"
  | "corner_cut"
  | "chamfer_45"
  | "round_corner"
  | "protruding_curve"
  | "replace_segment";

export interface InferredEdit {
  editType: SurfaceEditType;
  label: string;
  cornerIndex?: number;
  params?: { size?: number; radius?: number; length?: number };
  resultingPolygon: LayoutPoint[];
}

export interface DrawDesign {
  /** @deprecated Use surfaces. Kept for migration. */
  outline?: LayoutPoint[];
  surfaces: Surface[];
  cutouts: Cutout[];
  depth: number; // countertop depth in inches (default 24)
}

export const SNAP_GRID_INCH = 1;

// All surfaces (for backward compat: outline as single surface)
export function getDesignSurfaces(design: DrawDesign): Surface[] {
  if (design.surfaces?.length) return design.surfaces;
  if (design.outline && design.outline.length >= 3) {
    return [{ id: "s0", points: design.outline }];
  }
  return [];
}

// Canonical shape inferred from outline (for quoting and cabinet runs)
export type CanonicalShapeType = "rectangle" | "l" | "t" | "polygon";

export interface CanonicalShape {
  type: CanonicalShapeType;
  params?: {
    width?: number;
    depth?: number;
    legWidth?: number;
    legDepth?: number;
    armWidth?: number;
    armDepth?: number;
    points?: LayoutPoint[];
  };
}

// Standard cutout sizes (inches) for snap-to-size
export const STANDARD_CUTOUT_SIZES: {
  type: CutoutType;
  w: number;
  h: number;
  label: string;
}[] = [
  { type: "sink_single", w: 22, h: 18, label: "Single bowl 22×18" },
  { type: "sink_single", w: 24, h: 18, label: "Single bowl 24×18" },
  { type: "sink_double", w: 33, h: 22, label: "Double bowl 33×22" },
  { type: "sink_double", w: 36, h: 22, label: "Double bowl 36×22" },
  { type: "cooktop", w: 30, h: 21, label: "Cooktop 30×21" },
  { type: "cooktop", w: 36, h: 21, label: "Cooktop 36×21" },
];

export const CUTOUT_GRID_INCH = 1; // snap position to 1" grid

// Net area (sq in) for draw design: sum of surface areas minus cutout areas
export function drawDesignNetAreaSqIn(design: DrawDesign): number {
  const surfaces = getDesignSurfaces(design);
  const surfaceArea = surfaces.reduce(
    (sum, s) => sum + polygonAreaSqIn(s.points),
    0,
  );
  const cutoutArea = design.cutouts.reduce((sum, c) => {
    if (c.snappedRect) {
      return sum + c.snappedRect.w * c.snappedRect.h;
    }
    return sum + polygonAreaSqIn(c.points);
  }, 0);
  return Math.max(0, surfaceArea - cutoutArea);
}

// Single countertop piece - can be positioned and rotated in the room
export interface CountertopPiece {
  id: string;
  shape: "rectangle" | "l" | "t" | "polygon";
  // Rectangle: width (along wall), depth
  width: number;
  depth: number;
  // L-shape: leg extends from main run
  legWidth?: number;
  legDepth?: number;
  // T-shape: arms extending from stem
  armWidth?: number;
  armDepth?: number;
  // polygon: freeform from AI or manual
  points?: LayoutPoint[];
  position: { x: number; y: number };
  rotation: number; // degrees
}

// Standard cabinet widths (inches)
export const CABINET_STANDARD_WIDTHS = [12, 15, 18, 21, 24, 30, 36] as const;
export const CABINET_DEPTH = 24;
export const CABINET_HEIGHT = 34.5;
export const COUNTERTOP_OVERHANG = 1; // 1" front overhang

// Generate polygon from piece dimensions (in local coords, before position/rotation)
export function pieceToPolygon(piece: CountertopPiece): LayoutPoint[] {
  if (piece.shape === "polygon" && piece.points && piece.points.length >= 3) {
    return piece.points;
  }
  const {
    shape,
    width,
    depth,
    legWidth = 24,
    legDepth = 24,
    armWidth = 24,
    armDepth = 24,
  } = piece;
  const w = width;
  const d = depth;

  if (shape === "rectangle") {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ];
  }

  if (shape === "l") {
    // L: main run width x legDepth; leg is legWidth x (depth - legDepth), connects at corner
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: legDepth },
      { x: w - legWidth, y: legDepth },
      { x: w - legWidth, y: d },
      { x: 0, y: d },
    ];
  }

  // T-shape: center stem (width x depth) with two arms extending from top
  const armW = armWidth;
  const armD = armDepth;
  const half = w / 2;
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: d - armD },
    { x: half + armW, y: d - armD },
    { x: half + armW, y: d },
    { x: half - armW, y: d },
    { x: half - armW, y: d - armD },
    { x: 0, y: d - armD },
  ];
}

// Apply position and rotation to polygon (returns world-space points)
export function transformPolygon(
  points: LayoutPoint[],
  pos: { x: number; y: number },
  rotationDeg: number,
): LayoutPoint[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return points.map((p) => ({
    x: p.x * c - p.y * s + pos.x,
    y: p.x * s + p.y * c + pos.y,
  }));
}

// Point-in-polygon (ray casting)
export function pointInPolygon(
  px: number,
  py: number,
  points: LayoutPoint[],
): boolean {
  const n = points.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x,
      yi = points[i].y;
    const xj = points[j].x,
      yj = points[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Shoelace formula: area in square inches
export function polygonAreaSqIn(points: LayoutPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

// Convert square inches to square feet
export function sqInToSqFt(sqIn: number): number {
  return sqIn / 144;
}

// Polygon centroid
export function polygonCentroid(points: LayoutPoint[]): LayoutPoint {
  if (points.length < 3) return { x: 0, y: 0 };
  let cx = 0,
    cy = 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = points[i].x * points[j].y - points[j].x * points[i].y;
    area += cross;
    cx += (points[i].x + points[j].x) * cross;
    cy += (points[i].y + points[j].y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-6) return { x: 0, y: 0 };
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

// Split a run length into standard cabinet widths + stretch (last cabinet)
export function cabinetRunFromLength(length: number): number[] {
  const widths: number[] = [];
  let remaining = length;
  const sorted = [...CABINET_STANDARD_WIDTHS].sort((a, b) => b - a);

  while (remaining > 6) {
    const fit = sorted.find((w) => w <= remaining);
    if (fit) {
      widths.push(fit);
      remaining -= fit;
    } else {
      break;
    }
  }
  if (remaining > 0.5) {
    widths.push(Math.round(remaining * 10) / 10); // stretch cabinet
  }
  return widths;
}
