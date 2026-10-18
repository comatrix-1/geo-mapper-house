import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LatLngLiteral } from 'leaflet';
import { EditableImage } from '../../src/components/MapBoardEditable';
import type { MapImage, LayerStyle } from '../../src/types';

type DragEndHandler = (e: { target: { getLatLng: () => LatLngLiteral } }) => void;

// Mock react-leaflet so Marker and ImageOverlay render as plain DOM. The
// critical bit is mapping Leaflet's `dragend` event to React's `onDragEnd` prop
// — React ignores a handler registered as `onDragend`, so the mock translates
// the names before they reach the DOM.
vi.mock('react-leaflet', () => {
  const handlerNameMap: Record<string, string> = {
    dragend: 'onDragEnd',
    drag: 'onDrag',
    dragstart: 'onDragStart',
    click: 'onClick',
    mousedown: 'onMouseDown',
    mousemove: 'onMouseMove',
    mouseup: 'onMouseUp',
    mouseover: 'onMouseOver',
    mouseout: 'onMouseOut',
    mouseenter: 'onMouseEnter',
    mouseleave: 'onMouseLeave',
    keypress: 'onKeyDown',
    keydown: 'onKeyDown',
    keyup: 'onKeyUp',
  };

  const convertEventHandlers = (
    eventHandlers?: Record<string, DragEndHandler>,
  ): Record<string, DragEndHandler> => {
    if (!eventHandlers) return {};
    const handlers: Record<string, DragEndHandler> = {};
    for (const [key, val] of Object.entries(eventHandlers)) {
      const name = handlerNameMap[key] ?? ('on' + key.charAt(0).toUpperCase() + key.slice(1));
      handlers[name] = val;
    }
    return handlers;
  };

  return {
    Marker: ({
      title,
      eventHandlers,
    }: {
      title?: string;
      eventHandlers?: Record<string, DragEndHandler>;
    }) =>
      React.createElement('div', {
        'data-testid': 'marker',
        title: title,
        'aria-label': title,
        ...convertEventHandlers(eventHandlers),
      }),
    ImageOverlay: ({
      url,
      alt,
      children,
    }: {
      url?: string;
      alt?: string;
      children?: React.ReactNode;
    }) =>
      React.createElement('div', { className: 'image-overlay' },
        React.createElement('img', { src: url, alt: alt || 'Map image' }),
        children,
      ),
    Popup: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { className: 'popup' }, children),
    Circle: () => null,
    Polyline: () => null,
    Polygon: () => null,
    useMap: () => ({
      getCenter: () => ({ lat: 0, lng: 0 }),
      getZoom: () => 13,
    }),
    MapContainer: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', null, children),
  };
});

const markerAt = (position: { lat: number; lng: number }) => ({
  getLatLng: () => position,
});

const imageObject: MapImage = {
  id: 'img-1',
  layerId: 'layer-1',
  type: 'image',
  title: 'Survey photo',
  description: 'A survey photo',
  imageUrl: 'https://example.com/photo.png',
  fileName: 'photo.png',
  contentType: 'image/png',
  bounds: {
    southWest: { lat: 1, lng: 1 },
    northEast: { lat: 5, lng: 5 },
  },
};

const defaultStyle: LayerStyle = {
  borderColor: '#3388ff',
  borderWidth: 2,
  fillColor: '#3388ff',
  fillOpacity: 0.2,
};

const sharedProps = {
  style: defaultStyle,
  interactive: true,
  setSelectedObjectId: vi.fn(),
  onUpdate: vi.fn(),
};

describe('EditableImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an image overlay with the image url and title as alt text', () => {
    render(<EditableImage obj={imageObject} {...sharedProps} isSelected={true} />);

    const img = screen.getByAltText('Survey photo');
    expect(img).toHaveAttribute('src', imageObject.imageUrl);
  });

  it('translates bounds when the move handle is dragged', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...sharedProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    // Center of bounds {SW{1,1}, NE{5,5}} is {lat:3, lng:3}. Drag ends at
    // {lat:3, lng:4} -> delta {lat:0, lng:1} -> both corners shift by 1 lng.
    fireEvent.dragEnd(screen.getByLabelText('Move image overlay'), {
      target: markerAt({ lat: 3, lng: 4 }),
    });

    expect(onUpdate).toHaveBeenCalledWith('img-1', {
      bounds: {
        southWest: { lat: 1, lng: 2 },
        northEast: { lat: 5, lng: 6 },
      },
    });
  });

  it('resizes bounds when the northeast corner handle is dragged', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...sharedProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    // NE corner starts at {lat:5, lng:5}, dragged to {lat:5, lng:6}.
    fireEvent.dragEnd(screen.getByLabelText('Resize image northeast corner'), {
      target: markerAt({ lat: 5, lng: 6 }),
    });

    expect(onUpdate).toHaveBeenCalledWith('img-1', {
      bounds: {
        southWest: { lat: 1, lng: 1 },
        northEast: { lat: 5, lng: 6 },
      },
    });
  });
});