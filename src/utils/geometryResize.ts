import type { LatLngLiteral } from 'leaflet';
import type { MapImageBounds } from '../types';
import type { ImageCorner } from './imageOverlay';

/** A point in Leaflet's projected world-pixel plane at a given zoom. */
export interface Proj {
  x: number;
  y: number;
}

/**
 * The slice of the Leaflet map the geometry transforms depend on. A real
 * `L.Map` satisfies this; tests can supply a small stub.
 */
export interface ResizeMap {
  getZoom(): number;
  project(latlng: { lat: number; lng: number }, zoom?: number): Proj;
  unproject(point: Proj, zoom?: number): LatLngLiteral;
  distance(a: LatLngLiteral, b: LatLngLiteral): number;
}

/** Axis-aligned bounds in the projected plane (y grows southward). */
export interface ProjectedBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Earth's meridian circumference in meters, matching Leaflet's spherical mercator world width. */
const EARTH_CIRCUMFERENCE_M = 40075016.68557849;

const oppositeCornerMap: Record<ImageCorner, ImageCorner> = {
  northWest: 'southEast',
  southEast: 'northWest',
  northEast: 'southWest',
  southWest: 'northEast',
};

/** The bounding-box corner diagonally opposite the given one. */
export const oppositeCorner = (corner: ImageCorner): ImageCorner =>
  oppositeCornerMap[corner];

/** Bounds of a set of projected points. An empty set yields a degenerate box at the origin. */
export const getProjectedBounds = (points: Proj[]): ProjectedBounds => {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
};

/** The projected position of one corner of a bounds box. */
export const cornerPoint = (b: ProjectedBounds, corner: ImageCorner): Proj => ({
  x: corner === 'northEast' || corner === 'southEast' ? b.maxX : b.minX,
  y: corner === 'northWest' || corner === 'northEast' ? b.minY : b.maxY,
});

/**
 * Scale factors relative to a fixed anchor corner, from the dragged corner's
 * start position towards the cursor `target`.
 *
 * - Aspect-locked: a single uniform factor, the cursor projected onto the
 *   drag diagonal, so the width-to-height ratio is preserved.
 * - Unlocked: independent horizontal and vertical factors.
 *
 * A zero-width or zero-height extent on an axis leaves that axis unscaled
 * (factor 1) instead of dividing by zero, and negative factors are clamped to
 * zero so the object never inverts through its anchor.
 */
const computeScales = (
  anchor: Proj,
  draggedStart: Proj,
  target: Proj,
  aspectLocked: boolean,
): { sx: number; sy: number } => {
  const dx = draggedStart.x - anchor.x;
  const dy = draggedStart.y - anchor.y;

  if (aspectLocked) {
    const denom = dx * dx + dy * dy;
    if (denom === 0) return { sx: 1, sy: 1 };
    const k = Math.max(
      0,
      ((target.x - anchor.x) * dx + (target.y - anchor.y) * dy) / denom,
    );
    return { sx: k, sy: k };
  }

  const sx = dx !== 0 ? Math.max(0, (target.x - anchor.x) / dx) : 1;
  const sy = dy !== 0 ? Math.max(0, (target.y - anchor.y) / dy) : 1;
  return { sx, sy };
};

const scaleAbout = (p: Proj, anchor: Proj, sx: number, sy: number): Proj => ({
  x: anchor.x + (p.x - anchor.x) * sx,
  y: anchor.y + (p.y - anchor.y) * sy,
});

/**
 * Scale a set of projected vertices about the bounding-box corner opposite the
 * dragged one. Works entirely in the projected plane, so callers control the
 * zoom and coordinate conversion.
 */
export const resizeProjectedVertices = (
  points: Proj[],
  draggedCorner: ImageCorner,
  target: Proj,
  aspectLocked: boolean,
): Proj[] => {
  if (points.length === 0) return [];
  const b = getProjectedBounds(points);
  const anchor = cornerPoint(b, oppositeCorner(draggedCorner));
  const draggedStart = cornerPoint(b, draggedCorner);
  const { sx, sy } = computeScales(anchor, draggedStart, target, aspectLocked);
  return points.map((p) => scaleAbout(p, anchor, sx, sy));
};

/** Whole-shape resize for polylines and polygons, returning new geographic vertices. */
export const resizeLatLngVertices = (
  map: ResizeMap,
  positions: LatLngLiteral[],
  draggedCorner: ImageCorner,
  targetLatLng: LatLngLiteral,
  aspectLocked: boolean,
): LatLngLiteral[] => {
  const zoom = map.getZoom();
  const projected = positions.map((p) => map.project(p, zoom));
  const target = map.project(targetLatLng, zoom);
  return resizeProjectedVertices(projected, draggedCorner, target, aspectLocked).map(
    (p) => map.unproject(p, zoom),
  );
};

const normalizeBounds = (a: LatLngLiteral, b: LatLngLiteral): MapImageBounds => ({
  southWest: { lat: Math.min(a.lat, b.lat), lng: Math.min(a.lng, b.lng) },
  northEast: { lat: Math.max(a.lat, b.lat), lng: Math.max(a.lng, b.lng) },
});

/**
 * Whole-image resize in the projected plane. The opposite bounds corner stays
 * fixed; the aspect ratio is preserved unless `aspectLocked` is false (Shift).
 * The result is always a valid, non-inverted bounds rectangle.
 */
export const resizeLatLngBounds = (
  map: ResizeMap,
  bounds: MapImageBounds,
  draggedCorner: ImageCorner,
  targetLatLng: LatLngLiteral,
  aspectLocked: boolean,
): MapImageBounds => {
  const zoom = map.getZoom();
  const sw = map.project(bounds.southWest, zoom);
  const ne = map.project(bounds.northEast, zoom);
  const b = getProjectedBounds([sw, ne]);
  const anchor = cornerPoint(b, oppositeCorner(draggedCorner));
  const draggedStart = cornerPoint(b, draggedCorner);
  const target = map.project(targetLatLng, zoom);
  const { sx, sy } = computeScales(anchor, draggedStart, target, aspectLocked);
  const newSw = map.unproject(scaleAbout(sw, anchor, sx, sy), zoom);
  const newNe = map.unproject(scaleAbout(ne, anchor, sx, sy), zoom);
  return normalizeBounds(newSw, newNe);
};

/**
 * Round-circle resize in the projected plane. The opposite bounds corner stays
 * fixed and the result is always a circle (a single radius for both axes), so
 * the caller's modifier-key state has no effect here.
 */
export const resizeProjectedCircle = (
  center: Proj,
  radiusPx: number,
  draggedCorner: ImageCorner,
  target: Proj,
): { center: Proj; radiusPx: number } => {
  if (radiusPx <= 0) return { center, radiusPx: 0 };
  const b: ProjectedBounds = {
    minX: center.x - radiusPx,
    maxX: center.x + radiusPx,
    minY: center.y - radiusPx,
    maxY: center.y + radiusPx,
  };
  const anchor = cornerPoint(b, oppositeCorner(draggedCorner));
  const draggedStart = cornerPoint(b, draggedCorner);
  const dx = draggedStart.x - anchor.x;
  const dy = draggedStart.y - anchor.y;
  const denom = dx * dx + dy * dy;
  const k =
    denom === 0
      ? 1
      : Math.max(
          0,
          ((target.x - anchor.x) * dx + (target.y - anchor.y) * dy) / denom,
        );
  const newRadiusPx = radiusPx * k;
  // The new center is the midpoint of the fixed anchor and the moved corner.
  const newCenter: Proj = {
    x: anchor.x + (dx * k) / 2,
    y: anchor.y + (dy * k) / 2,
  };
  return { center: newCenter, radiusPx: newRadiusPx };
};

/** Projected radius (world pixels at `zoom`) for a meter radius under Leaflet's spherical mercator. */
export const metersToPixels = (meters: number, zoom: number): number =>
  (meters * 256 * Math.pow(2, zoom)) / EARTH_CIRCUMFERENCE_M;

/**
 * Full circle resize: takes the stored center and meter radius plus the dragged
 * bounding-box corner and cursor, and returns the new center and meter radius,
 * always round and anchored at the opposite corner.
 */
export const resizeCircle = (
  map: ResizeMap,
  center: LatLngLiteral,
  radiusMeters: number,
  draggedCorner: ImageCorner,
  targetLatLng: LatLngLiteral,
): { center: LatLngLiteral; radiusMeters: number } => {
  const zoom = map.getZoom();
  const projectedCenter = map.project(center, zoom);
  const radiusPx = metersToPixels(radiusMeters, zoom);
  const target = map.project(targetLatLng, zoom);
  const next = resizeProjectedCircle(projectedCenter, radiusPx, draggedCorner, target);
  const newCenter = map.unproject(next.center, zoom);
  // Derive the meter radius from the map's distance calculation along the east axis.
  const edge = map.unproject({ x: next.center.x + next.radiusPx, y: next.center.y }, zoom);
  const newRadiusMeters = map.distance(newCenter, edge);
  return { center: newCenter, radiusMeters: newRadiusMeters };
};
