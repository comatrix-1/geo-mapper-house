import type { LatLngLiteral } from 'leaflet';
import type { MapImageBounds } from '../types';
import { getImageCenter, getImageCornerPositions, type ImageCorner } from './imageOverlay';
import { getProjectedBounds, type Proj, type ResizeMap } from './geometryResize';

/** Increment the preview angle is rounded to while Shift is held. */
export const ROTATION_SNAP_STEP_DEG = 15;

/** How far outside the rotated frame a pointer must land to start rotating. */
export const ROTATION_BAND_PX = 24;

/**
 * How close to a frame corner a press must be before the corner's resize
 * handle wins over rotation. Corner handles are 12px icons; the wider
 * exclusion keeps near-misses from being swallowed by the grab band.
 */
export const ROTATION_CORNER_EXCLUSION_PX = 12;

/** Corners walked once around the frame, so the quad is a closed ring. */
export const FRAME_CORNER_RING: readonly ImageCorner[] = [
  'northWest',
  'northEast',
  'southEast',
  'southWest',
];

const OPPOSITE_CORNER: Record<ImageCorner, ImageCorner> = {
  northWest: 'southEast',
  southEast: 'northWest',
  northEast: 'southWest',
  southWest: 'northEast',
};

/** Which way each corner sits from the centre along the frame's own axes. */
const CORNER_SIGN: Record<ImageCorner, { x: 1 | -1; y: 1 | -1 }> = {
  northEast: { x: 1, y: -1 },
  northWest: { x: -1, y: -1 },
  southEast: { x: 1, y: 1 },
  southWest: { x: -1, y: 1 },
};

/** An image's frame, rotated and expressed in the map's projected plane. */
export interface ProjectedFrame {
  center: Proj;
  corners: Record<ImageCorner, Proj>;
  /** Unrotated footprint size in projected units. */
  width: number;
  height: number;
}

/**
 * Rotate a projected point around an origin. Leaflet's projected plane has y
 * growing southward, so this turns clockwise on screen: the direction CSS and
 * SVG `rotate()` use.
 */
export const rotatePoint = (point: Proj, origin: Proj, angleDeg: number): Proj => {
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
};

/**
 * The frame as the map sees it: footprint corners rotated about the projected
 * centre. Everything drawn or hit-tested for a rotated image — overlay,
 * selection frame, handles, rotation gesture — comes from this.
 */
export const getProjectedFrame = (
  map: ResizeMap,
  bounds: MapImageBounds,
  angleDeg: number,
): ProjectedFrame => {
  const zoom = map.getZoom();
  const positions = getImageCornerPositions(bounds);
  const center = map.project(getImageCenter(bounds), zoom);
  const corners = Object.fromEntries(
    Object.entries(positions).map(([corner, position]) => [
      corner,
      rotatePoint(map.project(position as LatLngLiteral, zoom), center, angleDeg),
    ]),
  ) as Record<ImageCorner, Proj>;

  // The footprint's own extents: rotation turns the frame, it does not resize
  // it, so these are measured before the turn.
  const southWest = map.project(bounds.southWest, zoom);
  const northEast = map.project(bounds.northEast, zoom);

  return {
    center,
    corners,
    width: Math.abs(northEast.x - southWest.x),
    height: Math.abs(southWest.y - northEast.y),
  };
};

/** The rotated frame corners back in geographic coordinates. */
export const getRotatedCornerLatLngs = (
  map: ResizeMap,
  bounds: MapImageBounds,
  angleDeg: number,
): Record<ImageCorner, LatLngLiteral> => {
  const zoom = map.getZoom();
  const { corners } = getProjectedFrame(map, bounds, angleDeg);
  return Object.fromEntries(
    Object.entries(corners).map(([corner, point]) => [corner, map.unproject(point, zoom)]),
  ) as Record<ImageCorner, LatLngLiteral>;
};

const frameLatLngBox = (map: ResizeMap, frame: ProjectedFrame): MapImageBounds => {
  const zoom = map.getZoom();
  const box = getProjectedBounds(Object.values(frame.corners));
  const a = map.unproject({ x: box.minX, y: box.minY }, zoom);
  const b = map.unproject({ x: box.maxX, y: box.maxY }, zoom);
  return {
    southWest: { lat: Math.min(a.lat, b.lat), lng: Math.min(a.lng, b.lng) },
    northEast: { lat: Math.max(a.lat, b.lat), lng: Math.max(a.lng, b.lng) },
  };
};

/** The rotated frame's axis-aligned extent, in geographic coordinates. */
export const getFrameLatLngBounds = (
  map: ResizeMap,
  bounds: MapImageBounds,
  angleDeg: number,
): MapImageBounds => frameLatLngBox(map, getProjectedFrame(map, bounds, angleDeg));

/**
 * Everything an SVG overlay needs to paint the image into its rotated frame:
 * the geographic box the SVG is stretched over, and the drawing in that box's
 * user units. The image is laid out as its unrotated footprint and turned with
 * an SVG `rotate()`, so the source raster is never rewritten.
 */
export interface RotatedOverlayGeometry {
  bounds: MapImageBounds;
  viewBox: string;
  image: { x: number; y: number; width: number; height: number };
  pivot: Proj;
  angleDeg: number;
}

export const getRotatedOverlayGeometry = (
  map: ResizeMap,
  bounds: MapImageBounds,
  angleDeg: number,
): RotatedOverlayGeometry => {
  const frame = getProjectedFrame(map, bounds, angleDeg);
  const box = getProjectedBounds(Object.values(frame.corners));
  // The user space is anchored on the frame centre, not the world origin.
  // Projected coordinates reach hundreds of millions at high zoom, where
  // absolute user units lose the precision a browser needs to place the
  // raster — the image can vanish while the geographic selection frame
  // stays put. Centre-relative numbers render at every zoom level.
  return {
    bounds: frameLatLngBox(map, frame),
    viewBox: `${box.minX - frame.center.x} ${box.minY - frame.center.y} ${box.maxX - box.minX} ${box.maxY - box.minY}`,
    image: {
      x: -frame.width / 2,
      y: -frame.height / 2,
      width: frame.width,
      height: frame.height,
    },
    pivot: { x: 0, y: 0 },
    angleDeg,
  };
};

/**
 * Whether a projected point sits within `marginPx` of any frame corner —
 * the zone where a press belongs to the resize handle, not to rotation.
 */
export const isNearFrameCorner = (
  point: Proj,
  corners: Record<ImageCorner, Proj>,
  marginPx: number = ROTATION_CORNER_EXCLUSION_PX,
): boolean =>
  FRAME_CORNER_RING.some((corner) => {
    const c = corners[corner]!;
    return Math.hypot(point.x - c.x, point.y - c.y) <= marginPx;
  });

const ringCrossSum = (ring: Proj[]): number => {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
};

/**
 * Perpendicular distance from a point to one frame edge, signed so that the
 * frame's inside is positive.
 */
const edgeOffset = (a: Proj, b: Proj, point: Proj, ringSign: number): number => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return 0;
  const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  return ((Math.sign(cross) === ringSign ? 1 : -1) * Math.abs(cross)) / length;
};

const everyEdgeOffset = (ring: Proj[], point: Proj, ringSign: number): number[] =>
  ring.map((a, i) => edgeOffset(a, ring[(i + 1) % ring.length]!, point, ringSign));

/** Whether a projected point lies inside the rotated frame. */
export const isPointInFrame = (point: Proj, corners: Record<ImageCorner, Proj>): boolean => {
  const ring = FRAME_CORNER_RING.map((corner) => corners[corner]);
  const area = ringCrossSum(ring);
  if (area === 0) return false;
  return everyEdgeOffset(ring, point, Math.sign(area)).every((offset) => offset >= 0);
};

/**
 * Whether a projected pointer sits in the band just outside the frame: the
 * grab zone for the rotation gesture. The band follows the frame's edges, so
 * it stays the same width however the frame is turned. Inside the frame, or
 * beyond the band, the map keeps its normal behaviour.
 */
export const isWithinRotationBand = (
  point: Proj,
  frame: ProjectedFrame,
  marginPx: number = ROTATION_BAND_PX,
): boolean => {
  const ring = FRAME_CORNER_RING.map((corner) => frame.corners[corner]);
  const area = ringCrossSum(ring);
  if (area === 0) return false;
  const offsets = everyEdgeOffset(ring, point, Math.sign(area));
  if (offsets.every((offset) => offset >= 0)) return false;
  return offsets.every((offset) => offset >= -marginPx);
};

const bearing = (origin: Proj, point: Proj): number =>
  (Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI;

/** Fold an angle into the range [-180, 180). */
export const normalizeRotation = (angleDeg: number): number => {
  const wrapped = angleDeg - 360 * Math.floor((angleDeg + 180) / 360);
  return wrapped === 0 ? 0 : wrapped;
};

/**
 * Angle the image takes once the pointer has travelled from `start` to
 * `current` around the frame centre, measured from the angle it began at. Only
 * the turn about the centre counts, so dragging radially leaves it alone.
 */
export const rotationFromPointer = (
  center: Proj,
  start: Proj,
  current: Proj,
  startAngleDeg: number,
): number =>
  normalizeRotation(
    startAngleDeg + normalizeRotation(bearing(center, current) - bearing(center, start)),
  );

/** Round an angle to the snap increment; unsnapped when `enabled` is false. */
export const snapRotation = (
  angleDeg: number,
  enabled: boolean,
  stepDeg: number = ROTATION_SNAP_STEP_DEG,
): number => {
  const normalized = normalizeRotation(angleDeg);
  if (!enabled || stepDeg <= 0) return normalized;
  return normalizeRotation(Math.round(normalized / stepDeg) * stepDeg);
};

/** Angle text shown while the rotation gesture is in progress. */
export const formatRotation = (angleDeg: number): string =>
  `${normalizeRotation(angleDeg).toFixed(1)}°`;

/**
 * Corner resize for a possibly rotated image, in the projected plane. The
 * rotated corner opposite the dragged one stays fixed, the angle is preserved,
 * and the footprint changes along its own rotated axes. At zero rotation this
 * reproduces the axis-aligned resize exactly.
 */
export const resizeRotatedImageBounds = (
  map: ResizeMap,
  bounds: MapImageBounds,
  angleDeg: number,
  draggedCorner: ImageCorner,
  targetLatLng: LatLngLiteral,
  aspectLocked: boolean,
): MapImageBounds => {
  const zoom = map.getZoom();
  const start = getProjectedFrame(map, bounds, angleDeg);
  const anchor = start.corners[OPPOSITE_CORNER[draggedCorner]]!;
  const target = map.project(targetLatLng, zoom);
  const sign = CORNER_SIGN[draggedCorner];

  // Read the cursor in the frame's own axes: the screen vector from the anchor
  // turned back by the image's angle.
  const radians = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const ux = target.x - anchor.x;
  const uy = target.y - anchor.y;
  const localX = ux * cos - uy * sin;
  const localY = ux * sin + uy * cos;

  // The anchor-to-corner diagonal, measured along those same axes: it carries
  // the sign of the dragged corner, so a west or south corner grows the other
  // way.
  const diagonalX = sign.x * start.width;
  const diagonalY = sign.y * start.height;
  let width: number;
  let height: number;
  if (aspectLocked) {
    const k = Math.max(
      0,
      (localX * diagonalX + localY * diagonalY) /
        (start.width * start.width + start.height * start.height),
    );
    width = start.width * k;
    height = start.height * k;
  } else {
    width = Math.max(0, localX * sign.x);
    height = Math.max(0, localY * sign.y);
  }

  // Half the anchor-to-corner diagonal, measured in screen space, lands the
  // new footprint centre with the anchor exactly where it started.
  const cornerOffset = rotatePoint({ x: sign.x * width, y: sign.y * height }, { x: 0, y: 0 }, angleDeg);
  const newCenter = { x: anchor.x + cornerOffset.x / 2, y: anchor.y + cornerOffset.y / 2 };

  const sw = map.unproject({ x: newCenter.x - width / 2, y: newCenter.y + height / 2 }, zoom);
  const ne = map.unproject({ x: newCenter.x + width / 2, y: newCenter.y - height / 2 }, zoom);
  return {
    southWest: { lat: Math.min(sw.lat, ne.lat), lng: Math.min(sw.lng, ne.lng) },
    northEast: { lat: Math.max(sw.lat, ne.lat), lng: Math.max(sw.lng, ne.lng) },
  };
};
