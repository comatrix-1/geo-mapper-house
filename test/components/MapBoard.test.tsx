import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MapBoard from '../../src/components/MapBoard';
import { BASEMAP_STYLE_KEY } from '../../src/utils/basemapStyle';
import type { Layer, MapObject } from '../../src/types';

// Mock react-leaflet: the map instance is a stub so the focus behaviour can be
// observed without a real Leaflet map (JSDOM has no layout engine).
// Meters-per-projected-unit at the mocked zoom, matching Leaflet's spherical
// mercator world width, so a circle's stored radius round-trips.
const PX_PER_METER = (256 * 2 ** 13) / 40075016.68557849;

const mapMock = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  getContainer: vi.fn(),
  panTo: vi.fn(),
  flyTo: vi.fn(),
  setView: vi.fn(),
  getZoom: vi.fn(() => 13),
  getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
  dragging: { disable: vi.fn(), enable: vi.fn() },
  addControl: vi.fn((control: { addTo: (map: unknown) => void }) => control.addTo(mapMock)),
  removeControl: vi.fn((control: { remove: () => void }) => control.remove()),
}));

// Leaflet's real projection needs a canvas-less layout, so the stub uses a
// linear projection (x = lng, y = -lat) that round-trips. Selected objects
// render their resize handles through it.
Object.assign(mapMock, {
  project: (ll: { lat: number; lng: number }) => ({ x: ll.lng, y: -ll.lat }),
  unproject: (p: { x: number; y: number }) => ({ lat: -p.y, lng: p.x }),
  distance: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    Math.hypot(a.lat - b.lat, a.lng - b.lng) / PX_PER_METER,
  mouseEventToLatLng: (ev: { clientX: number; clientY: number }) => ({
    lat: ev.clientY,
    lng: ev.clientX,
  }),
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  TileLayer: ({ url }: { url?: string }) =>
    React.createElement('div', {
      'data-testid': 'basemap-tile-layer',
      'data-url': url,
    }),
  Polyline: () => null,
  Polygon: () => null,
  Marker: () => null,
  ImageOverlay: () => null,
  Tooltip: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  // Shapes render as a clickable div so map clicks can be driven.
  Circle: ({ eventHandlers }: { eventHandlers?: Record<string, () => void> }) =>
    React.createElement('div', {
      'data-testid': 'circle',
      onClick: eventHandlers?.click,
    }),
  useMap: () => mapMock,
}));

const layer: Layer = {
  id: 'layer-1',
  name: 'Layer 1',
  visible: true,
  style: { borderColor: '#3388ff', borderWidth: 2, fillColor: '#3388ff', fillOpacity: 0.2 },
};

const circle: MapObject = {
  id: 'circle-1',
  layerId: 'layer-1',
  type: 'circle',
  title: 'A circle',
  description: '',
  center: { lat: 1.5, lng: 2.5 },
  radius: 100,
};

const image: MapObject = {
  id: 'image-1',
  layerId: 'layer-1',
  type: 'image',
  title: 'A photo',
  description: '',
  imageUrl: 'https://example.com/photo.png',
  fileName: 'photo.png',
  contentType: 'image/png',
  bounds: {
    southWest: { lat: 1, lng: 1 },
    northEast: { lat: 5, lng: 5 },
  },
};

const boardProps = (
  overrides: Partial<React.ComponentProps<typeof MapBoard>> = {},
): React.ComponentProps<typeof MapBoard> => ({
  layers: [layer],
  activeLayerId: 'layer-1',
  drawingMode: 'none',
  setDrawingMode: vi.fn(),
  objects: [circle, image],
  setObjects: vi.fn(),
  selectedObjectId: null,
  setSelectedObjectId: vi.fn(),
  geometryEditMode: 'resize' as const,
  rulerPoints: [],
  setRulerPoints: vi.fn(),
  focusTarget: null,
  ...overrides,
});

const renderBoard = (overrides: Partial<React.ComponentProps<typeof MapBoard>> = {}) =>
  render(<MapBoard {...boardProps(overrides)} />);

// Leaflet positions controls via these map internals; the stub map gets a
// real (body-attached) container with the four corner divs, so control DOM
// lands in the document. cleanup() removes the container after each test.
const attachMapContainer = () => {
  mapMock._container?.remove();
  const container = document.body.appendChild(document.createElement('div'));
  const corners: Record<string, HTMLElement> = {};
  for (const [v, h] of [
    ['top', 'left'],
    ['top', 'right'],
    ['bottom', 'left'],
    ['bottom', 'right'],
  ] as const) {
    corners[`${v}${h}`] = container.appendChild(document.createElement('div'));
  }
  Object.assign(mapMock, { _container: container, _controlCorners: corners });
};

describe('MapBoard focus behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapMock.getContainer.mockReturnValue(document.createElement('div'));
    attachMapContainer();
  });

  it('centres the focused object without changing the zoom level', () => {
    renderBoard({ focusTarget: { id: 'circle-1', token: 1 } });

    expect(mapMock.panTo).toHaveBeenCalledWith(
      { lat: 1.5, lng: 2.5 },
      expect.objectContaining({ animate: true }),
    );
    // A zoom change would come from flyTo/setView; focusing must not do that.
    expect(mapMock.flyTo).not.toHaveBeenCalled();
    expect(mapMock.setView).not.toHaveBeenCalled();
  });

  it('focuses every object type by its own centre', () => {
    renderBoard({ focusTarget: { id: 'image-1', token: 1 } });

    expect(mapMock.panTo).toHaveBeenCalledWith(
      { lat: 3, lng: 3 },
      expect.objectContaining({ animate: true }),
    );
  });

  it('re-centres when the same object is focused again', () => {
    const { rerender } = renderBoard({ focusTarget: { id: 'circle-1', token: 1 } });

    rerender(<MapBoard {...boardProps({ focusTarget: { id: 'circle-1', token: 2 } })} />);

    expect(mapMock.panTo).toHaveBeenCalledTimes(2);
  });

  it('ignores a focus request that was already handled', () => {
    const { rerender } = renderBoard({ focusTarget: { id: 'circle-1', token: 1 } });

    rerender(<MapBoard {...boardProps({ focusTarget: { id: 'circle-1', token: 1 } })} />);

    expect(mapMock.panTo).toHaveBeenCalledTimes(1);
  });

  it('selects an object clicked on the map without moving the viewport', () => {
    const setSelectedObjectId = vi.fn();
    renderBoard({ setSelectedObjectId });

    fireEvent.click(screen.getByTestId('circle'));

    expect(setSelectedObjectId).toHaveBeenCalledWith('circle-1');
    // Clicking an object on the map only selects it; the viewport stays put.
    expect(mapMock.panTo).not.toHaveBeenCalled();
    expect(mapMock.flyTo).not.toHaveBeenCalled();
    expect(mapMock.setView).not.toHaveBeenCalled();
  });
});

describe('MapBoard basemap style', () => {
  const basemapUrl = () =>
    screen.getByTestId('basemap-tile-layer').getAttribute('data-url');

  beforeEach(() => {
    localStorage.clear();
    attachMapContainer();
  });

  it('renders satellite by default when storage is empty', () => {
    renderBoard();
    expect(basemapUrl()).toContain('lyrs=s');
  });

  it('renders satellite when storage holds an unknown value', () => {
    localStorage.setItem(BASEMAP_STYLE_KEY, 'terrain');
    renderBoard();
    expect(basemapUrl()).toContain('lyrs=s');
  });

  it('restores a stored roadmap preference on mount', () => {
    localStorage.setItem(BASEMAP_STYLE_KEY, 'roadmap');
    renderBoard();
    expect(basemapUrl()).toContain('lyrs=m');
  });

  it('switches the tile URL and marks the active option when roadmap is clicked', () => {
    renderBoard();

    const toggle = screen.getByRole('group', { name: 'Basemap style' });
    expect(within(toggle).getByText('Satellite')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(toggle).getByText('Road'));

    expect(basemapUrl()).toContain('lyrs=m');
    expect(within(toggle).getByText('Road')).toHaveAttribute('aria-pressed', 'true');
    expect(within(toggle).getByText('Satellite')).toHaveAttribute('aria-pressed', 'false');
    // Switching style must not move the viewport.
    expect(mapMock.panTo).not.toHaveBeenCalled();
    expect(mapMock.flyTo).not.toHaveBeenCalled();
    expect(mapMock.setView).not.toHaveBeenCalled();
  });

  it('persists the selected style so a remount renders roadmap', () => {
    const { unmount } = renderBoard();

    fireEvent.click(within(screen.getByRole('group', { name: 'Basemap style' })).getByText('Road'));
    expect(localStorage.getItem(BASEMAP_STYLE_KEY)).toBe('roadmap');

    unmount();
    renderBoard();
    expect(basemapUrl()).toContain('lyrs=m');
  });
});
