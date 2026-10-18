import type { LatLngLiteral } from 'leaflet';

export type DrawingMode = 'none' | 'point' | 'circle' | 'polyline' | 'polygon' | 'ruler';

export interface BaseMapObject {
  id: string;
  layerId: string;
  type: 'point' | 'circle' | 'polyline' | 'polygon' | 'image';
  title: string;
  description: string;
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
