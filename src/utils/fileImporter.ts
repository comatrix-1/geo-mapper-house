import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';
import type { MapObject, Layer } from '../types';
import type { LatLngLiteral } from 'leaflet';

export interface ImportResult {
  layers: Layer[];
  objects: MapObject[];
}

interface ProjectData {
  version: string;
  timestamp: number;
  layers: Layer[];
  objects: MapObject[];
}

// Minimal structural types for parsed GeoJSON / project files (external, untrusted data)
interface GeoJSONGeometry {
  type?: string;
  coordinates?: unknown;
  geometries?: GeoJSONGeometry[];
}

interface GeoJSONFeature {
  geometry?: GeoJSONGeometry | null;
  properties?: Record<string, unknown> | null;
}

interface ParsedFile extends GeoJSONGeometry {
  features?: GeoJSONFeature[];
  layers?: Layer[];
  objects?: MapObject[];
}

// Convert GeoJSON coordinates [lng, lat] to Leaflet {lat, lng}
const toLatLng = (coords: number[]): LatLngLiteral => {
  if (!coords || coords.length < 2) return { lat: 0, lng: 0 };
  return { lat: coords[1], lng: coords[0] };
};

// Helper to safely extract string properties
const safeString = (val: unknown, fallback: string = ''): string => {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') {
     const { value } = val as { value?: unknown };
     if (value) return String(value);
     return fallback;
  }
  return String(val);
};

// Smart title extraction from properties
const getTitleFromProps = (props: Record<string, unknown> | null): string => {
    if (!props) return 'Untitled Object';
    const keys = Object.keys(props);
    
    // 1. Exact matches for common name fields (High Priority)
    const nameKey = keys.find(k => /^(name|title|label)$/i.test(k));
    if (nameKey) return safeString(props[nameKey]);
    
    // 2. Matches for keys ending in _N (common in GIS data, e.g., PLN_AREA_N)
    const nameLikeKey = keys.find(k => /_N$/i.test(k));
    if (nameLikeKey) return safeString(props[nameLikeKey]);

    // 3. Matches for standard IDs (Low Priority)
    const idKey = keys.find(k => /^(objectid|id)$/i.test(k));
    if (idKey) return safeString(props[idKey]);

    return 'Untitled Object';
};

// Smart description construction
const buildDescription = (props: Record<string, unknown> | null): string => {
    if (!props) return '';
    
    // Start with explicit description fields
    let desc = safeString(props.description || props.DESCRIPTION || props.desc || '', '');
    const keys = Object.keys(props);

    // Look for link fields (HYPERLINK, URL, WEBSITE) and append them
    const linkKeys = keys.filter(k => /^(hyperlink|url|website|link)$/i.test(k));
    
    linkKeys.forEach(k => {
        const val = safeString(props[k]);
        // Simple check to ensure it looks like a URL
        if (val && (val.startsWith('http') || val.startsWith('www'))) {
            // Avoid duplicating if the description already contains this link
            if (!desc.includes(val)) {
                desc += desc ? `\n\n` : '';
                desc += `${k.toUpperCase()}: ${val}`;
            }
        }
    });

    // If no description exists, try to dump other properties as key-value pairs
    if (!desc) {
        const ignoreRegex = /^(name|title|description|desc|objectid|shape_len|shape_area|geometry|type)$/i;
        const parts: string[] = [];
        for (const k of keys) {
            if (!ignoreRegex.test(k) && !linkKeys.includes(k)) {
                const val = safeString(props[k]);
                if (val) parts.push(`${k}: ${val}`);
            }
        }
        desc = parts.join('\n');
    }

    return desc.trim();
};

// Recursive function to extract simple geometries from complex ones
const extractObjectsFromGeometry = (
    geometry: GeoJSONGeometry | null,
    props: Record<string, unknown> | null,
    layerId: string,
    objects: MapObject[]
) => {
    if (!geometry) return;

    const title = getTitleFromProps(props);
    const description = buildDescription(props);
    
    switch (geometry.type) {
        case 'Point':
            objects.push({
                id: crypto.randomUUID(),
                layerId,
                type: 'point',
                title,
                description,
                position: toLatLng(geometry.coordinates as number[])
            });
            break;
            
        case 'LineString':
            objects.push({
                id: crypto.randomUUID(),
                layerId,
                type: 'polyline',
                title,
                description,
                positions: ((geometry.coordinates as number[][]) || []).map((c: number[]) => toLatLng(c))
            });
            break;
            
        case 'Polygon': {
             // Handle simple polygon (outer ring only for this app's data model)
             const rings = geometry.coordinates as number[][] | undefined;
             if (rings && rings.length > 0) {
                objects.push({
                    id: crypto.randomUUID(),
                    layerId,
                    type: 'polygon',
                    title,
                    description,
                    positions: rings[0].map((c: number[]) => toLatLng(c))
                });
             }
            break;
        }
            
        case 'GeometryCollection':
            if (geometry.geometries && Array.isArray(geometry.geometries)) {
                geometry.geometries.forEach((g) => {
                    extractObjectsFromGeometry(g, props, layerId, objects);
                });
            }
            break;

        case 'MultiPoint':
             if (geometry.coordinates && Array.isArray(geometry.coordinates)) {
                 (geometry.coordinates as number[][]).forEach((coords: number[]) => {
                     extractObjectsFromGeometry({ type: 'Point', coordinates: coords }, props, layerId, objects);
                 });
             }
             break;

        case 'MultiLineString':
             if (geometry.coordinates && Array.isArray(geometry.coordinates)) {
                 (geometry.coordinates as number[][][]).forEach((coords: number[][]) => {
                     extractObjectsFromGeometry({ type: 'LineString', coordinates: coords }, props, layerId, objects);
                 });
             }
             break;
             
         case 'MultiPolygon':
             if (geometry.coordinates && Array.isArray(geometry.coordinates)) {
                 (geometry.coordinates as number[][][][]).forEach((coords: number[][][]) => {
                     extractObjectsFromGeometry({ type: 'Polygon', coordinates: coords }, props, layerId, objects);
                 });
             }
             break;
    }
};

const processGeoJSON = (fc: ParsedFile | null, layerId: string): MapObject[] => {
  const objects: MapObject[] = [];

  if (!fc) return objects;

  // 1. Handle FeatureCollection (Standard)
  if (fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
      fc.features.forEach((feature) => {
          extractObjectsFromGeometry(feature.geometry, feature.properties || {}, layerId, objects);
      });
  } 
  // 2. Handle Single Feature
  else if (fc.type === 'Feature') {
      extractObjectsFromGeometry(fc.geometry, fc.properties || {}, layerId, objects);
  }
  // 3. Handle raw Geometry (Fallback)
  else if (fc.type === 'Point' || fc.type === 'LineString' || fc.type === 'Polygon' || fc.type === 'GeometryCollection') {
      extractObjectsFromGeometry(fc, {}, layerId, objects);
  }

  return objects;
};

export const importFile = async (file: File): Promise<ImportResult> => {
  let contentString = '';
  const fileName = file.name;
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  // Default style for single-layer imports
  const defaultLayerId = crypto.randomUUID();
  const defaultLayer: Layer = {
    id: defaultLayerId,
    name: fileName.replace(/\.[^/.]+$/, ""), // remove extension
    visible: true,
    style: {
        borderColor: '#000000',
        borderWidth: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.0 // colorless/transparent by default
    }
  };

  try {
    let geoJSON: ParsedFile | null = null;

    if (extension === 'kmz') {
      const zip = new JSZip();
      const unzipped = await zip.loadAsync(file);
      const kmlFilename = Object.keys(unzipped.files).find(f => f.toLowerCase().endsWith('.kml'));
      
      if (!kmlFilename) {
        throw new Error('No KML file found inside KMZ archive.');
      }
      contentString = await unzipped.files[kmlFilename].async('string');
      
      const parser = new DOMParser();
      const kmlDom = parser.parseFromString(contentString, 'text/xml');
      if (kmlDom.getElementsByTagName("parsererror").length > 0) {
          throw new Error("Error parsing internal KML XML.");
      }
      geoJSON = toGeoJSON.kml(kmlDom);

    } else if (extension === 'kml') {
      contentString = await file.text();
      // Remove BOM
      if (contentString.charCodeAt(0) === 0xFEFF) {
        contentString = contentString.slice(1);
      }
      contentString = contentString.trim();

      // Try parsing as XML first
      const parser = new DOMParser();
      const kmlDom = parser.parseFromString(contentString, 'text/xml');
      const parserErrors = kmlDom.getElementsByTagName("parsererror");
      
      if (parserErrors.length === 0) {
          geoJSON = toGeoJSON.kml(kmlDom);
      } else {
          // Fallback: Check if it's actually JSON misnamed as KML
          try {
              geoJSON = JSON.parse(contentString);
              console.warn("File extension was .kml but content was JSON. Parsed as GeoJSON.");
          } catch {
              throw new Error("Invalid KML file: " + parserErrors[0].textContent);
          }
      }

    } else if (extension === 'json' || extension === 'geojson') {
        contentString = await file.text();
        try {
            geoJSON = JSON.parse(contentString);
        } catch {
            throw new Error("Failed to parse JSON content.");
        }
    } else {
      throw new Error('Unsupported file format. Please upload .kml, .kmz, .json, or .geojson');
    }

    // CHECK FOR PROJECT FORMAT
    // If the JSON looks like a saved project (has layers and objects), return them directly
    if (geoJSON && Array.isArray(geoJSON.layers) && Array.isArray(geoJSON.objects)) {
        return {
            layers: geoJSON.layers,
            objects: geoJSON.objects
        };
    }

    // Standard GeoJSON processing (Create single wrapper layer)
    const objects = processGeoJSON(geoJSON, defaultLayerId);

    return { layers: [defaultLayer], objects };

  } catch (error) {
    console.error("Import failed", error);
    throw error;
  }
};

// Re-export as legacy name for compatibility if needed, but prefer importFile
export const importKmlKmz = importFile;

export const saveProjectToFile = (layers: Layer[], objects: MapObject[]) => {
    const data: ProjectData = {
        version: '1.0',
        timestamp: Date.now(),
        layers,
        objects
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `map-project-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const loadProjectFromFile = async (file: File): Promise<{ layers: Layer[], objects: MapObject[] }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                if (!json.layers || !json.objects) {
                    throw new Error("Invalid project file format");
                }
                resolve({ layers: json.layers, objects: json.objects });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
};