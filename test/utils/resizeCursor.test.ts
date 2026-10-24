import { describe, it, expect } from 'vitest';
import type { LatLngLiteral } from 'leaflet';
import { getVertexResizeCursors } from '../../src/utils/resizeCursor';
import {
  IMAGE_CORNERS,
  getImageCornerPositions,
} from '../../src/utils/imageOverlay';
import type { MapImageBounds } from '../../src/types';

const rect: LatLngLiteral[] = [
  { lat: 0, lng: 0 }, // south-west
  { lat: 0, lng: 10 }, // south-east
  { lat: 10, lng: 10 }, // north-east
  { lat: 10, lng: 0 }, // north-west
];

describe('getVertexResizeCursors', () => {
  it('returns no cursors for an empty shape', () => {
    expect(getVertexResizeCursors([])).toEqual([]);
  });

  it('returns no cursor for a lone vertex', () => {
    expect(getVertexResizeCursors([{ lat: 1, lng: 2 }])).toEqual([null]);
  });

  it('gives the corners of a rectangle the diagonal cursors', () => {
    // The south-west and north-east corners share the north-east/south-west
    // diagonal, the south-east and north-west corners the other one.
    expect(getVertexResizeCursors(rect)).toEqual([
      'nesw',
      'nwse',
      'nesw',
      'nwse',
    ]);
  });

  it('gives the corners of a wide rectangle the same diagonal cursors', () => {
    const wide: LatLngLiteral[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 1, lng: 10 },
      { lat: 1, lng: 0 },
    ];

    expect(getVertexResizeCursors(wide)).toEqual([
      'nesw',
      'nwse',
      'nesw',
      'nwse',
    ]);
  });

  it('gives the apex of a triangle a vertical cursor', () => {
    const triangle: LatLngLiteral[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 5 },
    ];

    expect(getVertexResizeCursors(triangle)).toEqual(['nesw', 'nwse', 'ns']);
  });

  it('gives the vertices of a horizontal line a horizontal cursor', () => {
    const line: LatLngLiteral[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
    ];

    expect(getVertexResizeCursors(line)).toEqual(['ew', 'ew']);
  });

  it('gives the vertices of a vertical line a vertical cursor', () => {
    const line: LatLngLiteral[] = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 0 },
    ];

    expect(getVertexResizeCursors(line)).toEqual(['ns', 'ns']);
  });

  it('gives a vertex in the middle of a shape no cursor', () => {
    const shape: LatLngLiteral[] = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 20, lng: 20 },
    ];

    expect(getVertexResizeCursors(shape)).toEqual(['nesw', null, 'nesw']);
  });

  it('gives the corners of an image the diagonal cursors', () => {
    const bounds: MapImageBounds = {
      southWest: { lat: 1, lng: 1 },
      northEast: { lat: 5, lng: 5 },
    };
    const corners = getImageCornerPositions(bounds);

    const cursors = getVertexResizeCursors(
      IMAGE_CORNERS.map((corner) => corners[corner]),
    );

    // north-west and south-east share the north-west/south-east diagonal.
    expect(cursors).toEqual(['nwse', 'nesw', 'nesw', 'nwse']);
  });
});
