import { describe, it, expect, beforeEach } from 'vitest';
import {
  BASEMAP_STYLE_KEY,
  DEFAULT_BASEMAP_STYLE,
  getTileUrl,
  readBasemapStyle,
  writeBasemapStyle,
} from '../../src/utils/basemapStyle';

describe('basemapStyle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a valid style through storage', () => {
    writeBasemapStyle('roadmap', localStorage);
    expect(localStorage.getItem(BASEMAP_STYLE_KEY)).toBe('roadmap');
    expect(readBasemapStyle(localStorage)).toBe('roadmap');

    writeBasemapStyle('satellite', localStorage);
    expect(readBasemapStyle(localStorage)).toBe('satellite');
  });

  it('builds the Google tile URL per style', () => {
    expect(getTileUrl('satellite')).toBe(
      'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    );
    expect(getTileUrl('roadmap')).toBe(
      'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    );
  });

  it('falls back to satellite when the stored value is unknown', () => {
    localStorage.setItem(BASEMAP_STYLE_KEY, 'terrain');
    expect(readBasemapStyle(localStorage)).toBe(DEFAULT_BASEMAP_STYLE);
  });

  it('falls back to satellite when no value is stored', () => {
    expect(readBasemapStyle(localStorage)).toBe(DEFAULT_BASEMAP_STYLE);
  });

  it('survives a storage whose access throws', () => {
    const hostile: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(() => readBasemapStyle(hostile)).not.toThrow();
    expect(readBasemapStyle(hostile)).toBe(DEFAULT_BASEMAP_STYLE);
    expect(() => writeBasemapStyle('roadmap', hostile)).not.toThrow();
  });
});
