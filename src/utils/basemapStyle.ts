export type BasemapStyle = 'satellite' | 'roadmap';

/** The style shown when storage holds nothing the app recognizes. */
export const DEFAULT_BASEMAP_STYLE: BasemapStyle = 'satellite';

export const BASEMAP_STYLE_KEY = 'geo-mapper:basemap-style';

const TILE_URL_TEMPLATES: Record<BasemapStyle, string> = {
  satellite: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  roadmap: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
};

export function getTileUrl(style: BasemapStyle): string {
  return TILE_URL_TEMPLATES[style];
}

function isBasemapStyle(value: unknown): value is BasemapStyle {
  return value === 'satellite' || value === 'roadmap';
}

/** Reads the stored style; anything unknown, absent, or unreadable falls back to satellite. */
export function readBasemapStyle(storage: Pick<Storage, 'getItem'>): BasemapStyle {
  try {
    const value = storage.getItem(BASEMAP_STYLE_KEY);
    return isBasemapStyle(value) ? value : DEFAULT_BASEMAP_STYLE;
  } catch {
    return DEFAULT_BASEMAP_STYLE;
  }
}

/** Writes the style; a storage that throws only loses persistence, not the view. */
export function writeBasemapStyle(style: BasemapStyle, storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(BASEMAP_STYLE_KEY, style);
  } catch {
    // persistence is best-effort
  }
}
