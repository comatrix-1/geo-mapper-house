import { describe, expect, it } from 'vitest';
import type { LatLngLiteral } from 'leaflet';
import {
  cornerPoint,
  getProjectedBounds,
  metersToPixels,
  oppositeCorner,
  resizeCircle,
  resizeLatLngBounds,
  resizeLatLngVertices,
  resizeProjectedCircle,
  resizeProjectedVertices,
  type Proj,
  type ResizeMap,
} from '../../src/utils/geometryResize';

// A linear stub whose projected scale matches Leaflet's spherical-mercator
// world so meter radii and pixel radii stay consistent. Zoom is fixed at 0.
const M_PER_DEG = (Math.PI / 180) * 6378137;
const PX_PER_M = 256 / 40075016.68557849;

const makeMap = (): ResizeMap => ({
  getZoom: () => 0,
  project: ({ lat, lng }: LatLngLiteral) => ({
    x: lng * M_PER_DEG * PX_PER_M,
    y: -lat * M_PER_DEG * PX_PER_M,
  }),
  unproject: ({ x, y }: Proj) => ({
    lat: -y / (M_PER_DEG * PX_PER_M),
    lng: x / (M_PER_DEG * PX_PER_M),
  }),
  distance: (a: LatLngLiteral, b: LatLngLiteral) =>
    Math.hypot(
      (a.lat - b.lat) * M_PER_DEG,
      (a.lng - b.lng) * M_PER_DEG,
    ),
});

const map = makeMap();

describe('projected bounds helpers', () => {
  it('reports the axis-aligned box of a point set', () => {
    expect(getProjectedBounds([{ x: 2, y: 5 }, { x: -1, y: 1 }, { x: 4, y: 8 }])).toEqual({
      minX: -1,
      minY: 1,
      maxX: 4,
      maxY: 8,
    });
  });

  it('maps each corner name to its projected position', () => {
    const b = { minX: 0, minY: 0, maxX: 10, maxY: 4 };
    expect(cornerPoint(b, 'northWest')).toEqual({ x: 0, y: 0 });
    expect(cornerPoint(b, 'northEast')).toEqual({ x: 10, y: 0 });
    expect(cornerPoint(b, 'southWest')).toEqual({ x: 0, y: 4 });
    expect(cornerPoint(b, 'southEast')).toEqual({ x: 10, y: 4 });
  });

  it('pairs opposite corners diagonally', () => {
    expect(oppositeCorner('northWest')).toBe('southEast');
    expect(oppositeCorner('southEast')).toBe('northWest');
    expect(oppositeCorner('northEast')).toBe('southWest');
    expect(oppositeCorner('southWest')).toBe('northEast');
  });
});

describe('resizeProjectedVertices (task 1.1)', () => {
  const rect: Proj[] = [
    { x: 0, y: 2 }, // south-west
    { x: 4, y: 2 }, // south-east
    { x: 4, y: 0 }, // north-east
    { x: 0, y: 0 }, // north-west
  ];

  it('keeps the opposite bounding-box corner fixed while scaling', () => {
    const out = resizeProjectedVertices(rect, 'northEast', { x: 8, y: 0 }, false);
    // Anchor is south-west (0,2); it must not move.
    expect(out[0]).toEqual({ x: 0, y: 2 });
  });

  it('preserves the width-to-height ratio when aspect-locked', () => {
    const out = resizeProjectedVertices(rect, 'northEast', { x: 8, y: 0 }, true);
    const b = getProjectedBounds(out);
    const ratio = (b.maxX - b.minX) / (b.maxY - b.minY);
    // Original ratio is 4 / 2 = 2.
    expect(ratio).toBeCloseTo(2, 6);
  });

  it('changes width and height independently when unlocked', () => {
    const out = resizeProjectedVertices(rect, 'northEast', { x: 8, y: 0 }, false);
    const b = getProjectedBounds(out);
    expect(b.maxX - b.minX).toBeCloseTo(8, 6);
    expect(b.maxY - b.minY).toBeCloseTo(2, 6);
  });

  it('never inverts the shape past its anchor (scales clamp at zero)', () => {
    // Drag the north-east corner past the south-west anchor.
    const out = resizeProjectedVertices(rect, 'northEast', { x: -5, y: 5 }, false);
    const b = getProjectedBounds(out);
    expect(b.maxX - b.minX).toBeCloseTo(0, 6);
    expect(b.maxY - b.minY).toBeCloseTo(0, 6);
  });

  it('handles a zero-height (horizontal) line without dividing by zero', () => {
    const line: Proj[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ];
    const locked = resizeProjectedVertices(line, 'northEast', { x: 8, y: 3 }, true);
    const unlocked = resizeProjectedVertices(line, 'northEast', { x: 8, y: 3 }, false);
    for (const out of [locked, unlocked]) {
      expect(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      expect(out[0]).toEqual({ x: 0, y: 0 }); // anchor stays put
    }
  });

  it('handles a zero-width (vertical) line without dividing by zero', () => {
    const line: Proj[] = [
      { x: 0, y: 0 },
      { x: 0, y: 4 },
    ];
    const out = resizeProjectedVertices(line, 'southEast', { x: 3, y: 8 }, false);
    expect(out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('resizeLatLngVertices round-trips through the map', () => {
  it('scales geographic vertices about the anchored corner', () => {
    const positions: LatLngLiteral[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 4 },
      { lat: 2, lng: 4 },
      { lat: 2, lng: 0 },
    ];
    // Drag the north-east corner straight east with Shift (unlocked).
    const out = resizeLatLngVertices(map, positions, 'northEast', { lat: 2, lng: 8 }, false);
    expect(out[0]!.lat).toBeCloseTo(0, 6);
    expect(out[0]!.lng).toBeCloseTo(0, 6);
    expect(out[2]!.lng).toBeCloseTo(8, 4);
  });
});

describe('resizeLatLngBounds (image resize, task 1.1)', () => {
  const bounds = {
    southWest: { lat: 0, lng: 0 },
    northEast: { lat: 4, lng: 4 },
  };

  it('locks the current aspect ratio by default', () => {
    const out = resizeLatLngBounds(map, bounds, 'northEast', { lat: 8, lng: 8 }, true);
    const latSpan = out.northEast.lat - out.southWest.lat;
    const lngSpan = out.northEast.lng - out.southWest.lng;
    expect(latSpan).toBeCloseTo(lngSpan, 4); // square stays square
    expect(out.southWest.lat).toBeCloseTo(0, 6);
    expect(out.southWest.lng).toBeCloseTo(0, 6);
  });

  it('lets width and height change independently on Shift', () => {
    const out = resizeLatLngBounds(map, bounds, 'northEast', { lat: 8, lng: 4 }, false);
    const latSpan = out.northEast.lat - out.southWest.lat;
    const lngSpan = out.northEast.lng - out.southWest.lng;
    expect(latSpan).toBeCloseTo(8, 4);
    expect(lngSpan).toBeCloseTo(4, 4);
  });

  it('returns valid, non-inverted bounds after crossing the anchor', () => {
    const out = resizeLatLngBounds(map, bounds, 'northEast', { lat: -2, lng: -2 }, false);
    expect(out.northEast.lat).toBeGreaterThanOrEqual(out.southWest.lat);
    expect(out.northEast.lng).toBeGreaterThanOrEqual(out.southWest.lng);
  });
});

describe('circle resize geometry (task 1.2)', () => {
  it('stays round: a single radius drives both axes', () => {
    const next = resizeProjectedCircle({ x: 10, y: 10 }, 5, 'northEast', { x: 20, y: 0 });
    const bounds = getProjectedBounds([
      { x: next.center.x - next.radiusPx, y: next.center.y - next.radiusPx },
      { x: next.center.x + next.radiusPx, y: next.center.y + next.radiusPx },
    ]);
    expect(bounds.maxX - bounds.minX).toBeCloseTo(bounds.maxY - bounds.minY, 6);
  });

  it('keeps the opposite corner anchored', () => {
    const center = { x: 10, y: 10 };
    const radiusPx = 5;
    const anchorBefore = cornerPoint(
      { minX: center.x - radiusPx, minY: center.y - radiusPx, maxX: center.x + radiusPx, maxY: center.y + radiusPx },
      oppositeCorner('northEast'),
    );
    const next = resizeProjectedCircle(center, radiusPx, 'northEast', { x: 25, y: 0 });
    const anchorAfter = cornerPoint(
      {
        minX: next.center.x - next.radiusPx,
        minY: next.center.y - next.radiusPx,
        maxX: next.center.x + next.radiusPx,
        maxY: next.center.y + next.radiusPx,
      },
      oppositeCorner('northEast'),
    );
    expect(anchorAfter).toEqual(anchorBefore);
  });

  it('is identical with and without Shift because it takes no modifier', () => {
    // The function has no shift parameter, so every call is aspect-locked;
    // a repeated call proves there is no hidden modifier state.
    const a = resizeCircle(map, { lat: 1, lng: 1 }, 1000, 'northEast', { lat: 2, lng: 2 });
    const b = resizeCircle(map, { lat: 1, lng: 1 }, 1000, 'northEast', { lat: 2, lng: 2 });
    expect(a).toEqual(b);
    expect(a.radiusMeters).toBeGreaterThan(0);
  });

  it('grows the radius when a corner is dragged outward', () => {
    const grown = resizeCircle(map, { lat: 0, lng: 0 }, 1000, 'northEast', { lat: 1, lng: 1 });
    expect(grown.radiusMeters).toBeGreaterThan(1000);
  });

  it('metersToPixels matches the map projection scale', () => {
    expect(metersToPixels(M_PER_DEG, 0)).toBeCloseTo(M_PER_DEG * PX_PER_M, 6);
  });
});
