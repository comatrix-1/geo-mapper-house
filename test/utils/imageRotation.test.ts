import { describe, expect, it } from 'vitest';
import type { LatLngLiteral } from 'leaflet';
import type { MapImageBounds } from '../../src/types';
import { resizeLatLngBounds } from '../../src/utils/geometryResize';
import type { Proj, ResizeMap } from '../../src/utils/geometryResize';
import {
  formatRotation,
  getFrameLatLngBounds,
  getProjectedFrame,
  getRotatedCornerLatLngs,
  getRotatedOverlayGeometry,
  isNearFrameCorner,
  isPointInFrame,
  isWithinRotationBand,
  normalizeRotation,
  resizeRotatedImageBounds,
  rotatePoint,
  rotationFromPointer,
  snapRotation,
} from '../../src/utils/imageRotation';
import { IMAGE_CORNERS } from '../../src/utils/imageOverlay';

/**
 * A linear projection so the rotation arithmetic is readable: x = lng,
 * y = -lat, matching Leaflet's southward-y plane.
 */
const map: ResizeMap = {
  getZoom: () => 0,
  project: ({ lat, lng }: LatLngLiteral) => ({ x: lng, y: -lat }),
  unproject: ({ x, y }: Proj) => ({ lat: y === 0 ? 0 : -y, lng: x === 0 ? 0 : x }),
  distance: (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng),
};

/** 4 wide (lng) by 2 tall (lat), so a quarter turn swaps the axes visibly. */
const footprint: MapImageBounds = {
  southWest: { lat: 0, lng: 0 },
  northEast: { lat: 2, lng: 4 },
};

const projectedCorners = (angleDeg: number) =>
  getProjectedFrame(map, footprint, angleDeg).corners;

const screenExtents = (corners: Record<string, Proj>) => {
  const points = Object.values(corners);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

/** Corner-by-corner comparison that tolerates trig rounding. */
const expectCloseCorners = (
  actual: Record<string, Proj>,
  expected: Record<string, { x: number; y: number }>,
) => {
  for (const [corner, point] of Object.entries(expected)) {
    expect(actual[corner]!.x).toBeCloseTo(point.x, 9);
    expect(actual[corner]!.y).toBeCloseTo(point.y, 9);
  }
};

const expectCloseBounds = (actual: MapImageBounds, expected: MapImageBounds) => {
  expect(actual.southWest.lat).toBeCloseTo(expected.southWest.lat, 9);
  expect(actual.southWest.lng).toBeCloseTo(expected.southWest.lng, 9);
  expect(actual.northEast.lat).toBeCloseTo(expected.northEast.lat, 9);
  expect(actual.northEast.lng).toBeCloseTo(expected.northEast.lng, 9);
};

/** Compares an SVG viewBox numerically: a quarter turn leaves float dust. */
const expectCloseViewBox = (actual: string, expected: [number, number, number, number]) => {
  const values = actual.split(' ').map(Number);
  expect(values).toHaveLength(4);
  values.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 9));
};

describe('rotatePoint', () => {
  it('leaves a point alone at zero degrees', () => {
    expect(rotatePoint({ x: 3, y: 4 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 4 });
  });

  it('turns clockwise on screen, the direction CSS rotate() uses', () => {
    // Due east of the origin, a quarter turn lands due south (y grows down).
    const turned = rotatePoint({ x: 2, y: 0 }, { x: 0, y: 0 }, 90);
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.y).toBeCloseTo(2, 9);
  });

  it('keeps the distance to the pivot', () => {
    const point = { x: 7, y: -3 };
    const origin = { x: 2, y: 1 };
    const turned = rotatePoint(point, origin, 137);
    expect(Math.hypot(turned.x - origin.x, turned.y - origin.y)).toBeCloseTo(
      Math.hypot(point.x - origin.x, point.y - origin.y),
      9,
    );
  });
});

describe('getProjectedFrame', () => {
  it('reproduces the axis-aligned footprint at zero degrees', () => {
    const frame = getProjectedFrame(map, footprint, 0);
    expect(frame.center).toEqual({ x: 2, y: -1 });
    expect(frame.width).toBeCloseTo(4, 9);
    expect(frame.height).toBeCloseTo(2, 9);
    expect(frame.corners.northWest).toMatchObject({ x: 0, y: -2 });
    expect(frame.corners.northEast).toMatchObject({ x: 4, y: -2 });
    expect(frame.corners.southWest).toMatchObject({ x: 0, y: 0 });
    expect(frame.corners.southEast).toMatchObject({ x: 4, y: 0 });
  });

  it('sweeps each corner a quarter turn clockwise around the centre', () => {
    // Footprint corners (0,-2) (4,-2) (0,0) (4,0) about centre (2,-1).
    const after = projectedCorners(90);
    expectCloseCorners(after, {
      northWest: { x: 3, y: -3 },
      northEast: { x: 3, y: 1 },
      southEast: { x: 1, y: 1 },
      southWest: { x: 1, y: -3 },
    });
  });

  it('keeps the footprint extents through a turn', () => {
    // Rotation turns the frame; the width and height it reports are the
    // image's own, not the screen box it lands in.
    for (const angle of [0, 30, 90, 137, -60]) {
      const frame = getProjectedFrame(map, footprint, angle);
      expect(frame.width).toBeCloseTo(4, 9);
      expect(frame.height).toBeCloseTo(2, 9);
    }
  });

  it('turns the frame the other way for a negative angle', () => {
    const after = projectedCorners(-90);
    expectCloseCorners(after, {
      northWest: { x: 1, y: 1 },
      northEast: { x: 1, y: -3 },
      southEast: { x: 3, y: -3 },
      southWest: { x: 3, y: 1 },
    });
  });

  it('swaps the screen extents after a quarter turn', () => {
    const flat = screenExtents(projectedCorners(0));
    const tall = screenExtents(projectedCorners(90));
    expect(tall.width).toBeCloseTo(flat.height, 9);
    expect(tall.height).toBeCloseTo(flat.width, 9);
  });

  it('returns the same frame after a full turn', () => {
    const before = projectedCorners(0);
    const after = projectedCorners(360);
    for (const corner of IMAGE_CORNERS) {
      expect(after[corner].x).toBeCloseTo(before[corner].x, 9);
      expect(after[corner].y).toBeCloseTo(before[corner].y, 9);
    }
  });
});

describe('geographic frame helpers', () => {
  it('round-trips the rotated corners back to lat/lng', () => {
    const latLngs = getRotatedCornerLatLngs(map, footprint, 90);
    const corners = projectedCorners(90);
    for (const corner of IMAGE_CORNERS) {
      expect(latLngs[corner]).toEqual(map.unproject(corners[corner], 0));
    }
  });

  it('encloses the rotated frame in an axis-aligned box', () => {
    expectCloseBounds(getFrameLatLngBounds(map, footprint, 90), {
      southWest: { lat: -1, lng: 1 },
      northEast: { lat: 3, lng: 3 },
    });
  });

  it('leaves the footprint box alone at zero degrees', () => {
    expect(getFrameLatLngBounds(map, footprint, 0)).toEqual(footprint);
  });

  it('describes the SVG overlay that paints the rotated frame', () => {
    const flat = getRotatedOverlayGeometry(map, footprint, 0);
    expect(flat.bounds).toEqual(footprint);
    // User space is anchored on the frame centre (2, -1), so the upright
    // footprint's box starts at (-2, -1) and the turn pivots on the origin.
    expect(flat.viewBox).toBe('-2 -1 4 2');
    expect(flat.image).toEqual({ x: -2, y: -1, width: 4, height: 2 });
    expect(flat.pivot).toEqual({ x: 0, y: 0 });

    const turned = getRotatedOverlayGeometry(map, footprint, 90);
    // The SVG grows to the box the turned frame needs...
    expectCloseViewBox(turned.viewBox, [-1, -2, 2, 4]);
    expectCloseBounds(turned.bounds, {
      southWest: { lat: -1, lng: 1 },
      northEast: { lat: 3, lng: 3 },
    });
    // ...while the image keeps its own rect and only the turn changes.
    expect(turned.image).toEqual(flat.image);
    expect(turned.angleDeg).toBe(90);
  });
});

describe('isNearFrameCorner', () => {
  const flat = getProjectedFrame(map, footprint, 0).corners;

  it('flags the corner itself and a point a few pixels off it', () => {
    expect(isNearFrameCorner({ x: 4, y: -2 }, flat)).toBe(true);
    expect(isNearFrameCorner({ x: 5, y: -2 }, flat)).toBe(true);
    expect(isNearFrameCorner({ x: 2, y: -4 }, flat)).toBe(true);
  });

  it('leaves the grab zone open further along the edge', () => {
    // 13 projected units from the nearest corner: outside the keep-out.
    expect(isNearFrameCorner({ x: 17, y: -2 }, flat)).toBe(false);
    expect(isNearFrameCorner({ x: 4, y: 13 }, flat)).toBe(false);
  });

  it('follows the corners when the frame turns', () => {
    const turned = getProjectedFrame(map, footprint, 90).corners;
    expect(isNearFrameCorner({ x: 3, y: -3 }, turned)).toBe(true);
    expect(isNearFrameCorner({ x: 16, y: -3 }, turned)).toBe(false);
  });

  it('respects a custom margin', () => {
    expect(isNearFrameCorner({ x: 5, y: -2 }, flat, 0)).toBe(false);
    expect(isNearFrameCorner({ x: 5, y: -2 }, flat, 1)).toBe(true);
  });
});

describe('frame hit testing', () => {
  it('treats the centre as inside the frame', () => {
    const frame = getProjectedFrame(map, footprint, 33);
    expect(isPointInFrame(frame.center, frame.corners)).toBe(true);
  });

  it('offers the band just outside an edge, and nothing beyond it', () => {
    const frame = getProjectedFrame(map, footprint, 0);
    // The north edge sits at y = -2; 10px above it is still within 24px.
    expect(isWithinRotationBand({ x: 2, y: -12 }, frame, 24)).toBe(true);
    expect(isWithinRotationBand({ x: 2, y: -42 }, frame, 24)).toBe(false);
  });

  it('keeps the band the same width as the frame turns', () => {
    const flat = getProjectedFrame(map, footprint, 0);
    const turned = getProjectedFrame(map, footprint, 30);
    const bandPoint = { x: 2, y: -12 };
    expect(isWithinRotationBand(rotatePoint(bandPoint, flat.center, 30), turned, 24)).toBe(true);

    const beyondBand = { x: 2, y: -42 };
    expect(
      isWithinRotationBand(rotatePoint(beyondBand, flat.center, 30), turned, 24),
    ).toBe(false);
  });

  it('never offers the band for a point inside the frame', () => {
    const frame = getProjectedFrame(map, footprint, 30);
    expect(isWithinRotationBand(frame.center, frame, 24)).toBe(false);
  });
});

describe('snapRotation', () => {
  it('rounds to the nearest 15 degrees while Shift is held', () => {
    expect(snapRotation(7, true)).toBe(0);
    expect(snapRotation(8, true)).toBe(15);
    expect(snapRotation(-8, true)).toBe(-15);
    expect(snapRotation(31, true)).toBe(30);
    expect(snapRotation(44.9, true)).toBe(45);
  });

  it('passes the angle through untouched when Shift is not held', () => {
    expect(snapRotation(8.37, false)).toBeCloseTo(8.37, 9);
    expect(snapRotation(-31.2, false)).toBeCloseTo(-31.2, 9);
  });

  it('stays on the increment when snapping is toggled mid-gesture', () => {
    const angle = 44.2;
    expect(snapRotation(angle, false)).toBeCloseTo(angle, 9);
    expect(snapRotation(angle, true)).toBe(45);
    expect(snapRotation(snapRotation(angle, true), false)).toBe(45);
  });

  it('stays on the 15-degree grid past a half turn', () => {
    expect(snapRotation(-176, true)).toBe(-180);
    expect(snapRotation(181, true)).toBe(-180);
  });
});

describe('normalizeRotation', () => {
  it('folds full turns and overshoot back into range', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-360)).toBe(0);
    expect(normalizeRotation(190)).toBeCloseTo(-170, 9);
    expect(normalizeRotation(-190)).toBeCloseTo(170, 9);
    expect(normalizeRotation(540)).toBeCloseTo(-180, 9);
  });
});

describe('rotationFromPointer', () => {
  const center = { x: 0, y: 0 };

  it('reports a quarter turn when the pointer swings east to south', () => {
    expect(rotationFromPointer(center, { x: 10, y: 0 }, { x: 0, y: 10 }, 0)).toBeCloseTo(90, 6);
  });

  it('ignores radial movement', () => {
    expect(rotationFromPointer(center, { x: 10, y: 0 }, { x: 40, y: 0 }, 12)).toBeCloseTo(12, 6);
  });

  it('measures from the angle the gesture started at', () => {
    expect(rotationFromPointer(center, { x: 0, y: 10 }, { x: -10, y: 0 }, 45)).toBeCloseTo(135, 6);
  });

  it('turns negative the other way', () => {
    expect(rotationFromPointer(center, { x: 10, y: 0 }, { x: 0, y: -10 }, 0)).toBeCloseTo(-90, 6);
  });

  it('stays in range across a half turn', () => {
    const angle = rotationFromPointer(center, { x: 10, y: 0 }, { x: -10, y: 0.0001 }, 0);
    expect(Math.abs(angle)).toBeLessThanOrEqual(180);
  });
});

describe('formatRotation', () => {
  it('shows one decimal place and a degree sign', () => {
    expect(formatRotation(45)).toBe('45.0°');
    expect(formatRotation(-7.25)).toBe('-7.3°');
  });
});

describe('resizeRotatedImageBounds', () => {
  it('matches the axis-aligned resize exactly at zero rotation', () => {
    const targets: LatLngLiteral[] = [
      { lat: 6, lng: 9 },
      { lat: 1, lng: 1 },
      { lat: -3, lng: 7 },
    ];
    for (const corner of IMAGE_CORNERS) {
      for (const aspectLocked of [true, false]) {
        for (const target of targets) {
          expectCloseBounds(
            resizeRotatedImageBounds(map, footprint, 0, corner, target, aspectLocked),
            resizeLatLngBounds(map, footprint, corner, target, aspectLocked),
          );
        }
      }
    }
  });

  it('grows the footprint along the rotated axes and keeps the angle', () => {
    // At 90 degrees the width axis points south and the height axis points
    // east, so the cursor below doubles both extents from the anchor.
    const grown = resizeRotatedImageBounds(map, footprint, 90, 'northEast', { lat: -5, lng: 5 }, false);
    expectCloseBounds(grown, {
      southWest: { lat: -3, lng: -1 },
      northEast: { lat: 1, lng: 7 },
    });

    // The same footprint still turns 90 degrees into the box the cursor left.
    const corners = getProjectedFrame(map, grown, 90).corners;
    expect(corners.southWest.x).toBeCloseTo(1, 6);
    expect(corners.southWest.y).toBeCloseTo(-3, 6);
    expect(corners.northEast.x).toBeCloseTo(5, 6);
    expect(corners.northEast.y).toBeCloseTo(5, 6);
  });

  it('holds the rotated corner opposite the drag in place', () => {
    for (const angle of [0, 30, 90, 135, 200, -45]) {
      const before = getProjectedFrame(map, footprint, angle).corners;
      const after = getProjectedFrame(
        map,
        resizeRotatedImageBounds(map, footprint, angle, 'northEast', { lat: -5, lng: 5 }, false),
        angle,
      ).corners;
      expect(after.southWest.x).toBeCloseTo(before.southWest.x, 6);
      expect(after.southWest.y).toBeCloseTo(before.southWest.y, 6);
    }
  });

  it('keeps the aspect ratio when locked at any angle', () => {
    for (const angle of [0, 25, 90, 137]) {
      const frame = getProjectedFrame(map, footprint, angle);
      const anchor = frame.corners.southWest;
      // Ask for exactly twice the footprint, measured along its own axes.
      const offset = rotatePoint(
        { x: 2 * frame.width, y: -2 * frame.height },
        { x: 0, y: 0 },
        angle,
      );
      const next = resizeRotatedImageBounds(
        map,
        footprint,
        angle,
        'northEast',
        map.unproject({ x: anchor.x + offset.x, y: anchor.y + offset.y }, 0),
        true,
      );
      expect(next.northEast.lng - next.southWest.lng).toBeCloseTo(8, 6);
      expect(next.northEast.lat - next.southWest.lat).toBeCloseTo(4, 6);
    }
  });
});
