import type { LatLngLiteral } from 'leaflet';
import type { MapObject } from '../types';

// Earth radius in meters
const R = 6371000;

const toRad = (value: number) => (value * Math.PI) / 180;

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const calculatePathLength = (positions: LatLngLiteral[]): number => {
  let distance = 0;
  for (let i = 0; i < positions.length - 1; i++) {
    distance += calculateDistance(
      positions[i].lat,
      positions[i].lng,
      positions[i+1].lat,
      positions[i+1].lng
    );
  }
  return distance;
};

// Calculate polygon area using Shoelace formula (approximate for spherical, but okay for small areas)
export const calculatePolygonArea = (positions: LatLngLiteral[]): number => {
  if (positions.length < 3) return 0;
  
  let area = 0;
  const j = positions.length - 1;

  // Project to meters approx (Mercator-ish for small areas)
  const origin = positions[0];
  const x = (lng: number) => toRad(lng - origin.lng) * R * Math.cos(toRad(origin.lat));
  const y = (lat: number) => toRad(lat - origin.lat) * R;

  let p1 = { x: x(positions[j].lng), y: y(positions[j].lat) };
  
  for (let i = 0; i < positions.length; i++) {
    const p2 = { x: x(positions[i].lng), y: y(positions[i].lat) };
    area += (p2.x - p1.x) * (p2.y + p1.y); // Trapezoid formula variation
    p1 = p2;
  }
  
  return Math.abs(area / 2);
};

export const formatDistance = (meters: number): string => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(1)} m`;
};

export const formatArea = (sqMeters: number): string => {
  if (sqMeters >= 1000000) return `${(sqMeters / 1000000).toFixed(2)} km²`;
  return `${sqMeters.toFixed(1)} m²`;
};

export const getCentroid = (positions: LatLngLiteral[]): LatLngLiteral => {
  if (positions.length === 0) return { lat: 0, lng: 0 };
  let latSum = 0;
  let lngSum = 0;
  positions.forEach(p => {
    latSum += p.lat;
    lngSum += p.lng;
  });
  return { lat: latSum / positions.length, lng: lngSum / positions.length };
};

export const getObjectCenter = (obj: MapObject): LatLngLiteral => {
    switch (obj.type) {
        case 'point': return obj.position;
        case 'circle': return obj.center;
        case 'polyline':
        case 'polygon': return getCentroid(obj.positions);
        case 'image':
          return {
            lat: (obj.bounds.southWest.lat + obj.bounds.northEast.lat) / 2,
            lng: (obj.bounds.southWest.lng + obj.bounds.northEast.lng) / 2,
          };
        default: return { lat: 0, lng: 0 };
    }
};
