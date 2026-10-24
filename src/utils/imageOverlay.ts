import type * as L from 'leaflet';
import type { LatLngLiteral } from 'leaflet';
import type { MapImageBounds } from '../types';

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_VIEWPORT_WIDTH_FRACTION = 0.3;

const normalizeImageBounds = (
  first: LatLngLiteral,
  second: LatLngLiteral,
): MapImageBounds => ({
  southWest: {
    lat: Math.min(first.lat, second.lat),
    lng: Math.min(first.lng, second.lng),
  },
  northEast: {
    lat: Math.max(first.lat, second.lat),
    lng: Math.max(first.lng, second.lng),
  },
});

export const validateImageFile = (file: File): string | null => {
  if (!file.type.startsWith('image/')) {
    return 'Please choose an image file.';
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return 'Image files must be 10 MB or smaller.';
  }

  return null;
};

export const getImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.onload = () => {
      cleanup();
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('Unable to read image dimensions.'));
    };
    image.src = objectUrl;
  });

export const createImageBounds = (map: L.Map, aspectRatio: number): MapImageBounds => {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new Error('Image aspect ratio must be greater than zero.');
  }

  const zoom = map.getZoom();
  const center = map.project(map.getCenter(), zoom);
  const width = map.getSize().x * IMAGE_VIEWPORT_WIDTH_FRACTION;
  const height = width / aspectRatio;

  const northWest = map.unproject(
    { x: center.x - width / 2, y: center.y - height / 2 } as L.Point,
    zoom,
  );
  const southEast = map.unproject(
    { x: center.x + width / 2, y: center.y + height / 2 } as L.Point,
    zoom,
  );

  return normalizeImageBounds(southEast, northWest);
};

/** A resize handle, named for the screen corner it sits on. */
export type ImageCorner = 'northWest' | 'northEast' | 'southWest' | 'southEast';

/** Corner order used for rendering handles and moving them during a drag. */
export const IMAGE_CORNERS: readonly ImageCorner[] = [
  'northWest',
  'northEast',
  'southWest',
  'southEast',
];

/** Centre point of a bounds rectangle. */
export const getImageCenter = (bounds: MapImageBounds): LatLngLiteral => ({
  lat: (bounds.southWest.lat + bounds.northEast.lat) / 2,
  lng: (bounds.southWest.lng + bounds.northEast.lng) / 2,
});

/** Position of each resize handle for a bounds rectangle. */
export const getImageCornerPositions = (
  bounds: MapImageBounds,
): Record<ImageCorner, LatLngLiteral> => ({
  northWest: { lat: bounds.northEast.lat, lng: bounds.southWest.lng },
  northEast: { lat: bounds.northEast.lat, lng: bounds.northEast.lng },
  southWest: { lat: bounds.southWest.lat, lng: bounds.southWest.lng },
  southEast: { lat: bounds.southWest.lat, lng: bounds.northEast.lng },
});

export const translateImageBounds = (
  bounds: MapImageBounds,
  delta: LatLngLiteral,
): MapImageBounds => ({
  southWest: {
    lat: bounds.southWest.lat + delta.lat,
    lng: bounds.southWest.lng + delta.lng,
  },
  northEast: {
    lat: bounds.northEast.lat + delta.lat,
    lng: bounds.northEast.lng + delta.lng,
  },
});

export const resizeImageBounds = (
  bounds: MapImageBounds,
  draggedCorner: ImageCorner,
  position: LatLngLiteral,
): MapImageBounds => {
  const oppositeCorner: LatLngLiteral = (() => {
    switch (draggedCorner) {
      case 'northWest':
        return { lat: bounds.southWest.lat, lng: bounds.northEast.lng };
      case 'northEast':
        return bounds.southWest;
      case 'southWest':
        return bounds.northEast;
      case 'southEast':
        return { lat: bounds.northEast.lat, lng: bounds.southWest.lng };
    }
  })();

  return normalizeImageBounds(oppositeCorner, position);
};
