import type { LatLngLiteral } from 'leaflet';

/**
 * The resize axes a CSS cursor can express.
 *
 * - `ns`  - north/south axis
 * - `ew`  - east/west axis
 * - `nesw` - north-east/south-west diagonal
 * - `nwse` - north-west/south-east diagonal
 */
export type ResizeCursor = 'ns' | 'ew' | 'nesw' | 'nwse';

/** A point in the local planar projection (x = east, y = north). */
interface ProjectedPoint {
  x: number;
  y: number;
}

/**
 * How far from the shape's center (as a fraction of its half extent) a
 * vertex has to sit before the direction counts as a corner. Corners get a
 * diagonal cursor, everything else falls back to a single axis.
 */
const CORNER_THRESHOLD = 0.5;

/**
 * Vertices this close to the shape's center have no meaningful direction, so
 * they get no directional cursor at all.
 */
const CENTER_THRESHOLD = 0.15;

/**
 * Projects positions into a local planar frame so longitudes can be compared
 * with latitudes. A degree of longitude shrinks towards the poles, so
 * longitudes are scaled by the cosine of the shape's mean latitude.
 */
const project = (positions: LatLngLiteral[]): ProjectedPoint[] => {
  const meanLat =
    positions.reduce((sum, position) => sum + position.lat, 0) /
    positions.length;
  const lngScale = Math.max(
    Math.abs(Math.cos((meanLat * Math.PI) / 180)),
    1e-6,
  );
  return positions.map((position) => ({
    x: position.lng * lngScale,
    y: position.lat,
  }));
};

/**
 * Works out the resize direction of every vertex of a shape.
 *
 * The direction is read from the shape's bounding box: a vertex sitting in a
 * corner of the box resizes along that corner's diagonal, a vertex on a side
 * resizes along that side's axis. A rectangular image therefore shows the
 * familiar diagonal cursors (the north-west and south-east corners share the
 * north-west/south-east axis) whatever its aspect ratio, and a triangular
 * polygon shows a vertical cursor on its apex.
 *
 * Returns `null` for vertices that have no meaningful direction.
 */
export const getVertexResizeCursors = (
  positions: LatLngLiteral[],
): (ResizeCursor | null)[] => {
  if (positions.length === 0) return [];

  const points = project(positions);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const halfWidth = (maxX - minX) / 2;
  const halfHeight = (maxY - minY) / 2;

  return points.map((point) => {
    // Normalised offset from the center: -1 on the west/north-west side of
    // the box, 1 on the east/south-east side.
    const nx = halfWidth > 0 ? (point.x - centerX) / halfWidth : 0;
    const ny = halfHeight > 0 ? (point.y - centerY) / halfHeight : 0;
    const absX = Math.abs(nx);
    const absY = Math.abs(ny);

    if (absX < CENTER_THRESHOLD && absY < CENTER_THRESHOLD) return null;

    if (absX >= CORNER_THRESHOLD && absY >= CORNER_THRESHOLD) {
      // The north-east and south-west corners share one diagonal, the
      // north-west and south-east corners the other.
      return Math.sign(nx) === Math.sign(ny) ? 'nesw' : 'nwse';
    }

    return absX >= absY ? 'ew' : 'ns';
  });
};
