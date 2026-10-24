import type L from 'leaflet';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getObjectCenter } from '../../src/utils/geoUtils';
import type { MapImage } from '../../src/types';
import {
  createImageBounds,
  getImageCenter,
  getImageCornerPositions,
  getImageDimensions,
  resizeImageBounds,
  translateImageBounds,
  validateImageFile,
} from '../../src/utils/imageOverlay';

const mapAtZoom = {
  getCenter: () => ({ lat: 10, lng: 20 }),
  getZoom: () => 4,
  getSize: () => ({ x: 1000, y: 600 }),
  project: ({ lat, lng }: { lat: number; lng: number }) => ({ x: lng * 100, y: -lat * 100 }),
  unproject: ({ x, y }: { x: number; y: number }) => ({ lat: -y / 100, lng: x / 100 }),
} as unknown as L.Map;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('image overlay utilities', () => {
  it('accepts an image file at or below the upload size limit', () => {
    expect(validateImageFile(new File(['x'], 'map.png', { type: 'image/png' }))).toBeNull();
    expect(
      validateImageFile(
        new File([new Uint8Array(10 * 1024 * 1024)], 'limit.png', { type: 'image/png' }),
      ),
    ).toBeNull();
  });

  it('rejects non-image files and files larger than 10 MB', () => {
    expect(
      validateImageFile(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
      ),
    ).toMatch(/10 MB/);
    expect(validateImageFile(new File(['x'], 'map.txt', { type: 'text/plain' }))).toMatch(/image/);
  });

  it('reads intrinsic image dimensions and releases its object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:map-image');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 640;
        naturalHeight = 480;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_value: string) {
          this.onload?.();
        }
      },
    );

    await expect(getImageDimensions(new File(['x'], 'map.png', { type: 'image/png' }))).resolves.toEqual({
      width: 640,
      height: 480,
    });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:map-image');
  });

  it('creates valid aspect-ratio-preserving bounds centered in the viewport', () => {
    expect(createImageBounds(mapAtZoom, 2)).toEqual({
      southWest: { lat: 9.25, lng: 18.5 },
      northEast: { lat: 10.75, lng: 21.5 },
    });
  });

  it('translates both image corners by the supplied latitude and longitude delta', () => {
    expect(
      translateImageBounds(
        { southWest: { lat: -2, lng: -1 }, northEast: { lat: 2, lng: 1 } },
        { lat: 3, lng: 4 },
      ),
    ).toEqual({ southWest: { lat: 1, lng: 3 }, northEast: { lat: 5, lng: 5 } });
  });

  it('keeps the opposite diagonal corner fixed and normalizes bounds after a crossed resize', () => {
    expect(
      resizeImageBounds(
        { southWest: { lat: -2, lng: -1 }, northEast: { lat: 2, lng: 1 } },
        'northEast',
        { lat: -4, lng: -3 },
      ),
    ).toEqual({ southWest: { lat: -4, lng: -3 }, northEast: { lat: -2, lng: -1 } });
  });

  it('returns the midpoint of an image bounds as its map-object center', () => {
    const image: MapImage = {
      id: 'image-1',
      layerId: 'layer-1',
      type: 'image',
      title: 'Map image',
      description: '',
      imageUrl: 'https://example.test/map.png',
      fileName: 'map.png',
      contentType: 'image/png',
      bounds: { southWest: { lat: -2, lng: 4 }, northEast: { lat: 6, lng: 12 } },
    };

    expect(getObjectCenter(image)).toEqual({ lat: 2, lng: 8 });
  });

  it('computes the centre of an image bounds', () => {
    expect(
      getImageCenter({ southWest: { lat: 1, lng: 2 }, northEast: { lat: 5, lng: 8 } }),
    ).toEqual({ lat: 3, lng: 5 });
  });

  it('places each resize handle on its corner of the image', () => {
    const bounds = {
      southWest: { lat: 1, lng: 2 },
      northEast: { lat: 5, lng: 8 },
    };

    expect(getImageCornerPositions(bounds)).toEqual({
      northWest: { lat: 5, lng: 2 },
      northEast: { lat: 5, lng: 8 },
      southWest: { lat: 1, lng: 2 },
      southEast: { lat: 1, lng: 8 },
    });
  });
});
