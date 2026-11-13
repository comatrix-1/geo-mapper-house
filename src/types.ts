import type { LatLngLiteral } from 'leaflet';

export type DrawingMode = 'none' | 'point' | 'circle' | 'polyline' | 'polygon' | 'ruler';

/**
 * Transient, selection-scoped geometry editing mode for images, lines and
 * polygons. `resize` shows four bounding-box handles that scale the whole
 * object; `vertices` exposes each stored vertex for independent editing.
 * Never persisted — it lives only in the map session and resets per selection.
 */
export type GeometryEditMode = 'resize' | 'vertices';

/**
 * Metadata for an image attached to any map object. The file lives in the
 * `map-images` bucket under `users/<uid>/objectImages/<objectId>/<imageId>/`;
 * only the reference travels with the object, so previously saved objects
 * without attachments load unchanged.
 */
export interface MapObjectImage {
  id: string;
  imageUrl: string;
  fileName: string;
  /** Storage path of the file, when it was uploaded by the app. */
  storagePath?: string;
  /** Firebase UID of the user who uploaded the file, for ownership-scoped cleanup. */
  storageOwnerId?: string;
}

export interface BaseMapObject {
  id: string;
  layerId: string;
  type: 'point' | 'circle' | 'polyline' | 'polygon' | 'image';
  title: string;
  description: string;
  /** Attached reference images. Absent means the object has none. */
  images?: MapObjectImage[];
}

export interface MapImageBounds {
  southWest: LatLngLiteral;
  northEast: LatLngLiteral;
}

export interface MapPoint extends BaseMapObject {
  type: 'point';
  position: LatLngLiteral;
}

export interface MapCircle extends BaseMapObject {
  type: 'circle';
  center: LatLngLiteral;
  radius: number; // in meters
}

export interface MapPolyline extends BaseMapObject {
  type: 'polyline';
  positions: LatLngLiteral[];
}

export interface MapPolygon extends BaseMapObject {
  type: 'polygon';
  positions: LatLngLiteral[];
}

export interface MapImage extends BaseMapObject {
  type: 'image';
  imageUrl: string;
  storagePath?: string;
  storageOwnerId?: string;
  fileName: string;
  contentType: string;
  bounds: MapImageBounds;
  /**
   * Degrees the image is turned clockwise about its centre, measured in the
   * map's projected plane. Absent means upright, so images saved before
   * rotation existed load unturned.
   */
  rotation?: number;
  /**
   * Normalized raster opacity (`0` fully transparent to `1` fully opaque).
   * Absent means fully opaque, so images saved before opacity existed load
   * at full opacity.
   */
  opacity?: number;
}

export type MapObject = MapPoint | MapCircle | MapPolyline | MapPolygon | MapImage;

export interface LayerStyle {
  borderColor: string;
  borderWidth: number;
  fillColor: string;
  fillOpacity: number;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  style: LayerStyle;
  /** Ordered map-object ids for sidebar display. Optional: absent means
   * natural order; the list self-heals against members (stale ids dropped,
   * new members appended) whenever it is consulted. */
  objectOrder?: string[];
}

export interface RulerState {
  active: boolean;
  points: LatLngLiteral[];
  totalDistance: number; // meters
}
