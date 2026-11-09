import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import L from 'leaflet';
import type { LatLngLiteral } from 'leaflet';
import {
  EditableCircle,
  EditableImage,
  EditablePoint,
  EditablePolygon,
  EditablePolyline,
  ROTATION_CURSOR,
} from '../../src/components/MapBoardEditable';
import type {
  MapCircle,
  MapImage,
  MapPolygon,
  MapPolyline,
  MapPoint,
  LayerStyle,
} from '../../src/types';

type DragEndHandler = (e: { target: { getLatLng: () => LatLngLiteral } }) => void;

/** Meters per projected unit at the mocked zoom 13 (Leaflet's mercator world). */
const PX_PER_METER = (256 * 2 ** 13) / 40075016.68557849;

/** Records the Leaflet calls a component makes while a drag is in progress. */
const leafletCalls = vi.hoisted(() => ({
  setBounds: [] as unknown[],
  setLatLng: [] as { position: LatLngLiteral }[],
  setLatLngs: [] as LatLngLiteral[][],
  setRadius: [] as number[],
  setCircleCenter: [] as LatLngLiteral[],
  draggingDisable: vi.fn(),
  draggingEnable: vi.fn(),
  mapOn: vi.fn(),
  mapOff: vi.fn(),
  /** The stand-in for `map.getContainer()`, where map-level gestures land. */
  mapContainer: null as HTMLElement | null,
  /** Zoom of the mocked map; doubling it doubles every projected distance. */
  zoom: 13,
}));

/** Clears the recorded Leaflet calls between tests. */
const resetLeafletCalls = () => {
  leafletCalls.setBounds = [];
  leafletCalls.setLatLng = [];
  leafletCalls.setLatLngs = [];
  leafletCalls.setRadius = [];
  leafletCalls.setCircleCenter = [];
  leafletCalls.zoom = 13;
};

// Every handle gesture must arm the one-shot trailing-click suppression, so
// the shared util is spied on and asserted per drag family below.
const suppressTrailingClickSpy = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/suppressTrailingClick', () => ({
  suppressTrailingClick: suppressTrailingClickSpy,
}));

// Mock react-leaflet so Marker and ImageOverlay render as plain DOM. The
// critical bit is mapping Leaflet's `dragend` event to React's `onDragEnd` prop
// — React ignores a handler registered as `onDragend`, so the mock translates
// the names before they reach the DOM.
//
// Marker and ImageOverlay also forward a ref to a stand-in for the Leaflet
// object, so tests can observe live drag updates.
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

  /** A shape layer (circle/polyline/polygon) rendered as a clickable div. */
  const shapeLayer =
    (testId: string) =>
    React.forwardRef(
      (
        {
          positions,
          eventHandlers,
        }: {
          positions?: LatLngLiteral[];
          eventHandlers?: Record<string, DragEndHandler>;
        },
        ref: React.Ref<unknown>,
      ) => {
        // The live drag previews call through these Leaflet path methods, so
        // tests observe them the same way the map would.
        React.useImperativeHandle(ref, () => ({
          setLatLngs: (positionsToDraw: LatLngLiteral[]) => {
            leafletCalls.setLatLngs.push(positionsToDraw);
          },
          setLatLng: (position: LatLngLiteral) => {
            leafletCalls.setCircleCenter.push(position);
          },
          setRadius: (radius: number) => {
            leafletCalls.setRadius.push(radius);
          },
        }));
        return React.createElement('div', {
          'data-testid': testId,
          // Lets tests read which shape the component asked to draw.
          ...(positions ? { 'data-positions': JSON.stringify(positions) } : {}),
          ...convertEventHandlers(eventHandlers),
        });
      },
    );

  return {
    Marker: React.forwardRef(
      (
        {
          position,
          title,
          bubblingMouseEvents,
          eventHandlers,
        }: {
          position?: LatLngLiteral;
          title?: string;
          bubblingMouseEvents?: boolean;
          eventHandlers?: Record<string, DragEndHandler>;
        },
        ref: React.Ref<unknown>,
      ) => {
        React.useImperativeHandle(ref, () => ({
          setLatLng: (newPosition: LatLngLiteral) => {
            leafletCalls.setLatLng.push({ position: newPosition });
          },
        }));
        return React.createElement('div', {
          'data-testid': 'marker',
          title: title,
          'aria-label': title,
          // The handle's drawn position, so tests can follow the frame.
          'data-lat': String(position?.lat),
          'data-lng': String(position?.lng),
          // Recorded so tests can assert handles never reach the map itself.
          'data-bubbling': String(bubblingMouseEvents !== false),
          ...convertEventHandlers(eventHandlers),
        });
      },
    ),
    SVGOverlay: React.forwardRef(
      (
        {
          attributes,
          children,
          eventHandlers,
        }: {
          attributes?: Record<string, string>;
          children?: React.ReactNode;
          eventHandlers?: Record<string, DragEndHandler>;
        },
        ref: React.Ref<unknown>,
      ) => {
        const svgRef = React.useRef<SVGSVGElement>(null);
        React.useImperativeHandle(ref, () => ({
          setBounds: (bounds: unknown) => {
            leafletCalls.setBounds.push(bounds);
          },
          // Leaflet's SVGOverlay element is the <svg> itself, which is where
          // the user space is written during a live preview.
          getElement: () => svgRef.current,
        }));
        return React.createElement(
          'div',
          {
            'data-testid': 'image-overlay',
            className: 'image-overlay',
            ...convertEventHandlers(eventHandlers),
          },
          React.createElement('svg', { ref: svgRef, ...attributes }, children),
        );
      },
    ),
    Popup: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { className: 'popup' }, children),
    Circle: shapeLayer('circle'),
    Polyline: shapeLayer('polyline'),
    Polygon: shapeLayer('polygon'),
    useMap: () => ({
      getCenter: () => ({ lat: 0, lng: 0 }),
      getZoom: () => leafletCalls.zoom,
      // A linear projection whose inverse round-trips, so resize maths stay
      // readable: x = lng, y = -lat, scaled by the zoom like Leaflet's plane.
      project: (ll: { lat: number; lng: number }) => ({
        x: ll.lng * 2 ** (leafletCalls.zoom - 13),
        y: -ll.lat * 2 ** (leafletCalls.zoom - 13),
      }),
      // `-0` would leak out of a plain negation and break `toEqual`, so the
      // inverse keeps zeros positive.
      unproject: (p: { x: number; y: number }) => {
        const lng = p.x * 2 ** (13 - leafletCalls.zoom);
        const lat = -p.y * 2 ** (13 - leafletCalls.zoom);
        return {
          lat: lat === 0 ? 0 : lat,
          lng: lng === 0 ? 0 : lng,
        };
      },
      // Inverts the projection at the mocked zoom, so a circle's stored meter
      // radius round-trips through its projected radius.
      distance: (a: LatLngLiteral, b: LatLngLiteral) =>
        Math.hypot(a.lat - b.lat, a.lng - b.lng) / PX_PER_METER,
      mouseEventToLatLng: (ev: { clientX: number; clientY: number }) => ({
        lat: ev.clientY,
        lng: ev.clientX,
      }),
      dragging: {
        disable: leafletCalls.draggingDisable,
        enable: leafletCalls.draggingEnable,
      },
      // The rotation gesture listens on the map container itself, so tests
      // press there and the pan/zoom listeners are only counted.
      on: leafletCalls.mapOn,
      off: leafletCalls.mapOff,
      getContainer: () => {
        if (!leafletCalls.mapContainer) {
          const container = document.createElement('div');
          container.setAttribute('data-testid', 'map-container');
          document.body.append(container);
          leafletCalls.mapContainer = container;
        }
        return leafletCalls.mapContainer;
      },
    }),
    MapContainer: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', null, children),
  };
});

const markerAt = (position: { lat: number; lng: number }) => ({
  getLatLng: () => position,
});

/**
 * The directional cursors of the handle icons rendered so far, in the order
 * the icons were created. Leaflet's `divIcon` is mocked, so the cursor can
 * only be read from the class name it was created with.
 */
const renderedHandleCursors = (): string[] =>
  vi
    .mocked(L.divIcon)
    .mock.calls.map(
      (call) =>
        (call[0] as { className?: string } | undefined)?.className?.match(
          /geo-handle--(\w+)/,
        )?.[1] ?? '',
    )
    .filter((cursor) => cursor !== '');

/** Reads the geographic position a mocked marker was drawn at. */
const markerPosition = (handle: HTMLElement): LatLngLiteral => ({
  lat: Number(handle.dataset.lat),
  lng: Number(handle.dataset.lng),
});

/** The turn the component has painted into the overlay's raster. */
const rasterTransform = (container: HTMLElement): string =>
  container.querySelector('image')!.getAttribute('transform')!;

/**
 * The angle and pivot of that turn, parsed because a projected pivot can
 * carry floating-point dust from the geometry that produced it.
 */
const readTransform = (container: HTMLElement) => {
  const [angle, pivotX, pivotY] = rasterTransform(container)
    .match(/rotate\(([^)]+)\)/)![1]
    .split(' ')
    .map(Number);
  return { angle, pivotX, pivotY };
};

/** The SVG user space the overlay draws into, as [x, y, width, height]. */
const readViewBox = (container: HTMLElement): number[] =>
  container
    .querySelector('svg')!
    .getAttribute('viewBox')!
    .split(' ')
    .map(Number);

/** Compares a list of numbers with the slack trigonometry needs. */
const expectCloseNumbers = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 6);
  });
};

/**
 * Compares positions the way a rotated frame produces them: a quarter turn
 * leaves floating-point dust from cos(90 degrees) on the zero axis.
 */
const expectClosePosition = (actual: LatLngLiteral, expected: LatLngLiteral) => {
  expect(actual.lat).toBeCloseTo(expected.lat, 6);
  expect(actual.lng).toBeCloseTo(expected.lng, 6);
};

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

/**
 * A wide footprint, so a turn moves its corners onto positions the unturned
 * box never occupies — a square would only swap corners with itself.
 */
const wideImage: MapImage = {
  ...imageObject,
  bounds: {
    southWest: { lat: 1, lng: 1 },
    northEast: { lat: 5, lng: 7 },
  },
};

/** The wide footprint a quarter turn on. */
const rotatedImage: MapImage = { ...wideImage, rotation: 90 };

const defaultStyle: LayerStyle = {
  borderColor: '#3388ff',
  borderWidth: 2,
  fillColor: '#3388ff',
  fillOpacity: 0.2,
};

/** A three-vertex polygon, shared by the handle-mode tests below. */
const triangleFixture: MapPolygon = {
  id: 'poly-4',
  layerId: 'layer-1',
  type: 'polygon',
  title: 'A triangle',
  description: '',
  positions: [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 10 },
    { lat: 10, lng: 10 },
  ],
};

const sharedProps = {
  style: defaultStyle,
  interactive: true,
  // Independent (native-draggable) corners/vertices, matching the pre-resize
  // editing behavior these tests were written against.
  geometryEditMode: 'vertices' as const,
  onSelect: vi.fn(),
  onUpdate: vi.fn(),
};

describe('EditableImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('renders the image url into the overlay', () => {
    const { container } = render(
      <EditableImage obj={imageObject} {...sharedProps} isSelected={true} />,
    );

    expect(container.querySelector('image')).toHaveAttribute(
      'href',
      imageObject.imageUrl,
    );
    expect(screen.getByLabelText('Survey photo')).toBeInTheDocument();
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

  it('moves the overlay live while the move handle is dragged', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...sharedProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    // Dragging to {lat:3, lng:4} shifts both corners by 1 lng. The overlay
    // must follow the cursor before the drag ends.
    fireEvent.drag(screen.getByLabelText('Move image overlay'), {
      target: markerAt({ lat: 3, lng: 4 }),
    });

    expect(leafletCalls.setBounds).toHaveLength(1);
    const bounds = leafletCalls.setBounds[0] as {
      getSouthWest: () => LatLngLiteral;
      getNorthEast: () => LatLngLiteral;
    };
    expect(bounds.getSouthWest()).toMatchObject({ lat: 1, lng: 2 });
    expect(bounds.getNorthEast()).toMatchObject({ lat: 5, lng: 6 });

    // The committed state is only updated when the drag ends.
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('resizes the overlay live while a corner handle is dragged', () => {
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
    fireEvent.drag(screen.getByLabelText('Resize image northeast corner'), {
      target: markerAt({ lat: 5, lng: 6 }),
    });

    expect(leafletCalls.setBounds).toHaveLength(1);
    const bounds = leafletCalls.setBounds[0] as {
      getSouthWest: () => LatLngLiteral;
      getNorthEast: () => LatLngLiteral;
    };
    expect(bounds.getSouthWest()).toMatchObject({ lat: 1, lng: 1 });
    expect(bounds.getNorthEast()).toMatchObject({ lat: 5, lng: 6 });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('keeps the resize handles glued to the overlay while it moves', () => {
    render(
      <EditableImage
        obj={imageObject}
        {...sharedProps}
        isSelected={true}
        onUpdate={vi.fn()}
      />,
    );

    fireEvent.drag(screen.getByLabelText('Move image overlay'), {
      target: markerAt({ lat: 3, lng: 4 }),
    });

    // The four corner handles follow the overlay by the same 1 lng shift.
    expect(leafletCalls.setLatLng).toEqual(
      expect.arrayContaining([
        { position: expect.objectContaining({ lat: 5, lng: 2 }) },
        { position: expect.objectContaining({ lat: 5, lng: 6 }) },
        { position: expect.objectContaining({ lat: 1, lng: 2 }) },
        { position: expect.objectContaining({ lat: 1, lng: 6 }) },
      ]),
    );
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

describe('rotated image frame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('draws an image saved before rotation existed as an upright frame', () => {
    const { container } = render(
      <EditableImage obj={wideImage} {...sharedProps} isSelected={false} />,
    );

    // User space is anchored on the frame centre (4, -3): the footprint
    // spans lng 1..7 and lat 1..5, so its box starts at (-3, -2) relative
    // to the centre, drawn with no turn about the origin.
    expect(rasterTransform(container)).toBe('rotate(0 0 0)');
    const raster = container.querySelector('image')!;
    expect(raster).toHaveAttribute('x', '-3');
    expect(raster).toHaveAttribute('y', '-2');
    expect(raster).toHaveAttribute('width', '6');
    expect(raster).toHaveAttribute('height', '4');
    expectCloseNumbers(readViewBox(container), [-3, -2, 6, 4]);
  });

  it('turns the raster about the centre without rewriting the footprint', () => {
    const { container } = render(
      <EditableImage obj={rotatedImage} {...sharedProps} isSelected={false} />,
    );

    const raster = container.querySelector('image')!;
    expect(rasterTransform(container)).toBe('rotate(90 0 0)');
    // Same rect as upright: the angle is a drawing transform, not a crop.
    expect(raster).toHaveAttribute('x', '-3');
    expect(raster).toHaveAttribute('y', '-2');
    expect(raster).toHaveAttribute('width', '6');
    expect(raster).toHaveAttribute('height', '4');

    // The frame now reaches lat 0..6 and lng 2..6: a quarter turn swaps the
    // screen extents, so the overlay's box follows, still centre-anchored.
    expectCloseNumbers(readViewBox(container), [-2, -3, 4, 6]);
  });

  it('re-derives the projected frame when the map pans or zooms', () => {
    const { container } = render(
      <EditableImage obj={rotatedImage} {...sharedProps} isSelected={false} />,
    );

    expect(leafletCalls.mapOn).toHaveBeenCalledWith(
      'zoomend moveend',
      expect.any(Function),
    );

    // One zoom level doubles the projected size of everything, and the frame
    // scales with it, so the turn looks the same on screen.
    leafletCalls.zoom = 14;
    const [, reproject] = leafletCalls.mapOn.mock.calls[0] as [string, () => void];
    act(() => reproject());

    expect(rasterTransform(container)).toBe('rotate(90 0 0)');
    expectCloseNumbers(readViewBox(container), [-4, -6, 8, 12]);
  });

  it('puts the selection frame and its handles on the rotated corners', () => {
    render(<EditableImage obj={rotatedImage} {...sharedProps} isSelected={true} />);

    const ring = JSON.parse(screen.getByTestId('polygon').dataset.positions!) as LatLngLiteral[];
    // Walked around the frame: northwest, northeast, southeast, southwest.
    expectClosePosition(ring[0], { lat: 6, lng: 6 });
    expectClosePosition(ring[1], { lat: 0, lng: 6 });
    expectClosePosition(ring[2], { lat: 0, lng: 2 });
    expectClosePosition(ring[3], { lat: 6, lng: 2 });

    expectClosePosition(
      markerPosition(screen.getByLabelText('Resize image northeast corner')),
      { lat: 0, lng: 6 },
    );
    // Turning is about the centre, so the move handle stays put.
    expectClosePosition(markerPosition(screen.getByLabelText('Move image overlay')), {
      lat: 3,
      lng: 4,
    });
  });
});

describe('image rotation gesture', () => {
  /** A press beyond the wide frame's east edge, inside the band, clear of the corner keep-out. */
  const BAND_PRESS = { clientX: 20, clientY: 3 };
  /** A pointer swung 26.57 degrees clockwise from that press. */
  const TURN_MOVE = { clientX: 10, clientY: 0 };

  const startRotationDrag = (shift = false) => {
    fireEvent.mouseDown(screen.getByTestId('map-container'), {
      ...BAND_PRESS,
      button: 0,
    });
    fireEvent.mouseMove(document, { ...TURN_MOVE, shiftKey: shift });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('previews the angle and reads it out while dragged outside the frame', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage obj={wideImage} {...sharedProps} isSelected={true} onUpdate={onUpdate} />,
    );

    startRotationDrag();

    // Straight east of the centre (4, -3), then down to (10, 0): atan2(3, 6).
    expect(screen.getByTestId('rotation-readout')).toHaveTextContent('26.6°');
    expect(onUpdate).not.toHaveBeenCalled();
    // The viewport holds still for the whole gesture.
    expect(leafletCalls.draggingDisable).toHaveBeenCalledTimes(1);
  });

  it('snaps the readout to 15 degrees while Shift is held, even mid-drag', () => {
    render(<EditableImage obj={wideImage} {...sharedProps} isSelected={true} />);

    startRotationDrag();
    expect(screen.getByTestId('rotation-readout')).toHaveTextContent('26.6°');

    // Shift is read live, so it takes effect without restarting the gesture.
    fireEvent.mouseMove(document, { ...TURN_MOVE, shiftKey: true });
    expect(screen.getByTestId('rotation-readout')).toHaveTextContent('30.0°');

    fireEvent.mouseMove(document, { ...TURN_MOVE, shiftKey: false });
    expect(screen.getByTestId('rotation-readout')).toHaveTextContent('26.6°');
  });

  it('applies the angle once, when the pointer is released', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage obj={wideImage} {...sharedProps} isSelected={true} onUpdate={onUpdate} />,
    );

    startRotationDrag(true);
    fireEvent.mouseUp(document, { ...TURN_MOVE, shiftKey: true });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toBe('img-1');
    expect(onUpdate.mock.calls[0][1]).toEqual({ rotation: 30 });
    expect(screen.queryByTestId('rotation-readout')).not.toBeInTheDocument();
    expect(leafletCalls.draggingEnable).toHaveBeenCalledTimes(1);
  });

  it('leaves the corner keep-out zone to the resize handles', () => {
    render(
      <EditableImage obj={wideImage} {...sharedProps} isSelected={true} onUpdate={vi.fn()} />,
    );

    // Projected (9, -2): inside the 24px band, but within 12px of the
    // northeast corner (7, -1) where the resize handle lives. A press
    // here must never turn into a rotation.
    fireEvent.mouseDown(screen.getByTestId('map-container'), {
      clientX: 9,
      clientY: 2,
      button: 0,
    });
    fireEvent.mouseMove(document, TURN_MOVE);

    expect(screen.queryByTestId('rotation-readout')).not.toBeInTheDocument();
  });

  it('leaves a press that never drags to the map, so it can deselect', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage obj={wideImage} {...sharedProps} isSelected={true} onUpdate={onUpdate} />,
    );

    fireEvent.mouseDown(screen.getByTestId('map-container'), {
      ...BAND_PRESS,
      button: 0,
    });
    fireEvent.mouseUp(document, BAND_PRESS);

    expect(onUpdate).not.toHaveBeenCalled();
    // Nothing was turned, so the click that follows must still reach the map.
    expect(suppressTrailingClickSpy).not.toHaveBeenCalled();
  });

  it('keeps panning when the pointer is pressed far outside the band', () => {
    render(<EditableImage obj={wideImage} {...sharedProps} isSelected={true} />);

    // 93 projected units past the east edge, well beyond the band.
    fireEvent.mouseDown(screen.getByTestId('map-container'), {
      clientX: 100,
      clientY: 3,
      button: 0,
    });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 0 });

    expect(screen.queryByTestId('rotation-readout')).not.toBeInTheDocument();
    expect(leafletCalls.draggingDisable).not.toHaveBeenCalled();
  });

  it('ignores the gesture on an image that is not selected', () => {
    render(
      <EditableImage obj={wideImage} {...sharedProps} isSelected={false} onUpdate={vi.fn()} />,
    );

    startRotationDrag();

    expect(screen.queryByTestId('rotation-readout')).not.toBeInTheDocument();
  });

  it('shows the rotation cursor over the band outside the frame', () => {
    render(<EditableImage obj={wideImage} {...sharedProps} isSelected={true} />);
    const container = screen.getByTestId('map-container');

    fireEvent.mouseMove(container, BAND_PRESS);
    expect(container.style.cursor).toBe(ROTATION_CURSOR);
  });

  it('keeps the normal cursor inside the frame and beyond the band', () => {
    const { rerender } = render(
      <EditableImage obj={wideImage} {...sharedProps} isSelected={true} />,
    );
    const container = screen.getByTestId('map-container');

    // Inside the frame: the centre, projected (4, -3) at zoom 13.
    fireEvent.mouseMove(container, { clientX: 4, clientY: 3 });
    expect(container.style.cursor).toBe('');

    // Far outside the band.
    fireEvent.mouseMove(container, { clientX: 100, clientY: 3 });
    expect(container.style.cursor).toBe('');

    fireEvent.mouseMove(container, BAND_PRESS);
    expect(container.style.cursor).toBe(ROTATION_CURSOR);

    // Leaving the map hands the cursor back too.
    fireEvent.mouseLeave(container);
    expect(container.style.cursor).toBe('');

    // And deselecting does.
    fireEvent.mouseMove(container, BAND_PRESS);
    expect(container.style.cursor).toBe(ROTATION_CURSOR);
    rerender(<EditableImage obj={wideImage} {...sharedProps} isSelected={false} />);
    expect(container.style.cursor).toBe('');
  });

  it('does not offer the rotation cursor on an unselected image', () => {
    render(<EditableImage obj={wideImage} {...sharedProps} isSelected={false} />);
    const container = screen.getByTestId('map-container');

    fireEvent.mouseMove(container, BAND_PRESS);
    expect(container.style.cursor).toBe('');
  });

  it('holds the rotation cursor from press to release during the drag', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage obj={wideImage} {...sharedProps} isSelected={true} onUpdate={onUpdate} />,
    );
    const container = screen.getByTestId('map-container');

    fireEvent.mouseDown(container, { ...BAND_PRESS, button: 0 });
    // Far outside the previewing frame's band mid-drag: the cursor still
    // says the gesture in progress is a rotation.
    fireEvent.mouseMove(document, { clientX: 100, clientY: 0 });
    expect(container.style.cursor).toBe(ROTATION_CURSOR);

    fireEvent.mouseUp(document, { clientX: 100, clientY: 0 });
    expect(container.style.cursor).toBe('');
  });
});

describe('move and resize with a nonzero rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('keeps the turn while the image moves and welds handles to the frame', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <EditableImage obj={rotatedImage} {...sharedProps} isSelected={true} onUpdate={onUpdate} />,
    );

    // One lng east: the footprint shifts, the angle is not part of the move.
    fireEvent.drag(screen.getByLabelText('Move image overlay'), {
      target: markerAt({ lat: 3, lng: 5 }),
    });

    expect(rasterTransform(container)).toBe('rotate(90 0 0)');
    // The corners the handles were pushed to are the turned box of the moved
    // footprint, not the moved box of the upright footprint.
    const pushed = leafletCalls.setLatLng.map((call) => call.position);
    expectClosePosition(pushed.at(-4)!, { lat: 6, lng: 7 }); // north-west
    expectClosePosition(pushed.at(-3)!, { lat: 0, lng: 7 }); // north-east
    expectClosePosition(pushed.at(-2)!, { lat: 6, lng: 3 }); // south-west
    expectClosePosition(pushed.at(-1)!, { lat: 0, lng: 3 }); // south-east

    fireEvent.dragEnd(screen.getByLabelText('Move image overlay'), {
      target: markerAt({ lat: 3, lng: 5 }),
    });

    expect(onUpdate).toHaveBeenCalledWith('img-1', {
      bounds: { southWest: { lat: 1, lng: 2 }, northEast: { lat: 5, lng: 8 } },
    });
  });

  it('resizes around the rotated frame and persists only the footprint', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <EditableImage
        obj={rotatedImage}
        {...sharedProps}
        geometryEditMode="resize"
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    // Doubled along the frame's own axes from the anchored southeast corner:
    // the turned northeast corner reaches (10, 6) in projected units.
    dragCornerHandle('Resize image northeast corner', { lat: -6, lng: 10 });

    expect(readTransform(container).angle).toBeCloseTo(90, 6);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updates = onUpdate.mock.calls[0][1] as Partial<MapImage>;
    // The angle survives untouched: only the footprint is written.
    expect(Object.keys(updates)).toEqual(['bounds']);
    expectClosePosition(updates.bounds!.southWest, { lat: -4, lng: 0 });
    expectClosePosition(updates.bounds!.northEast, { lat: 4, lng: 12 });
  });
});

describe('handle cursors by editing mode', () => {
  const rectangle: MapPolygon = {
    id: 'g-2',
    layerId: 'layer-1',
    type: 'polygon',
    title: 'A rectangle',
    description: '',
    positions: [
      { lat: 0, lng: 0 }, // south-west
      { lat: 0, lng: 10 }, // south-east
      { lat: 10, lng: 10 }, // north-east
      { lat: 10, lng: 0 }, // north-west
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('shows a four-way move cursor on every vertex handle in vertex mode', () => {
    render(
      <EditablePolygon obj={rectangle} {...sharedProps} isSelected={true} />,
    );

    // A vertex moves freely, so no resize axis is advertised.
    expect(renderedHandleCursors()).toEqual([
      'move',
      'move',
      'move',
      'move',
    ]);
  });

  it('shows a four-way move cursor on the image corner handles in vertex mode', () => {
    render(
      <EditableImage obj={imageObject} {...sharedProps} isSelected={true} />,
    );

    expect(renderedHandleCursors()).toEqual([
      'move',
      'move',
      'move',
      'move',
    ]);
  });

  it('shows directional cursors on the bounding-box handles in resize mode', () => {
    render(
      <EditablePolygon
        obj={rectangle}
        {...sharedProps}
        geometryEditMode="resize"
        isSelected={true}
      />,
    );

    // The corners are rendered in IMAGE_CORNERS order: north-west,
    // north-east, south-west, south-east.
    expect(renderedHandleCursors()).toEqual([
      'nwse', // north-west
      'nesw', // north-east
      'nesw', // south-west
      'nwse', // south-east
    ]);
  });

  it('keeps image bounding-box handles directional in resize mode', () => {
    render(
      <EditableImage
        obj={imageObject}
        {...sharedProps}
        geometryEditMode="resize"
        isSelected={true}
      />,
    );

    expect(renderedHandleCursors()).toEqual([
      'nwse', // north-west
      'nesw', // north-east
      'nesw', // south-west
      'nwse', // south-east
    ]);
  });

  it('leaves the vertices of an unselected object without a cursor', () => {
    render(
      <EditablePolygon obj={rectangle} {...sharedProps} isSelected={false} />,
    );

    expect(renderedHandleCursors()).toEqual([]);
  });
});

describe('object click handling', () => {
  const point: MapPoint = {
    id: 'p-1',
    layerId: 'layer-1',
    type: 'point',
    title: 'A point',
    description: '',
    position: { lat: 1, lng: 2 },
  };

  const circle: MapCircle = {
    id: 'c-1',
    layerId: 'layer-1',
    type: 'circle',
    title: 'A circle',
    description: '',
    center: { lat: 1, lng: 2 },
    radius: 100,
  };

  const polyline: MapPolyline = {
    id: 'l-1',
    layerId: 'layer-1',
    type: 'polyline',
    title: 'A line',
    description: '',
    positions: [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ],
  };

  const polygon: MapPolygon = {
    id: 'g-1',
    layerId: 'layer-1',
    type: 'polygon',
    title: 'A polygon',
    description: '',
    positions: [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
      { lat: 5, lng: 6 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it.each([
    ['point', 'p-1', <EditablePoint obj={point} {...sharedProps} isSelected={false} />, 'marker'],
    ['circle', 'c-1', <EditableCircle obj={circle} {...sharedProps} isSelected={false} />, 'circle'],
    ['polyline', 'l-1', <EditablePolyline obj={polyline} {...sharedProps} isSelected={false} />, 'polyline'],
    ['polygon', 'g-1', <EditablePolygon obj={polygon} {...sharedProps} isSelected={false} />, 'polygon'],
    ['image', 'img-1', <EditableImage obj={imageObject} {...sharedProps} isSelected={false} />, 'image-overlay'],
  ])('selects the %s object when it is clicked on the map', (_type, id, element, testId) => {
    const onSelect = vi.fn();
    render(
      React.cloneElement(element, { onSelect }),
    );

    fireEvent.click(screen.getByTestId(testId));

    expect(onSelect).toHaveBeenCalledWith(id);
  });

  it('does not select an object while the map is in a drawing mode', () => {
    const onSelect = vi.fn();
    render(
      <EditableCircle
        obj={circle}
        {...sharedProps}
        interactive={false}
        isSelected={false}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByTestId('circle'));

    expect(onSelect).not.toHaveBeenCalled();
  });
});

type CornerLabel = `Resize ${string} ${string} corner`;

/**
 * Drives one bounding-box handle of the four-handle resize mode. The mode uses
 * a document-level pointer gesture (Leaflet's own marker drag cannot express an
 * aspect-locked corner), so the test presses the handle and then moves and
 * releases the pointer on the document. The mocked map reads a pointer position
 * as `{lat: clientY, lng: clientX}`.
 */
const dragCornerHandle = (
  label: CornerLabel,
  to: { lat: number; lng: number },
  shift = false,
) => {
  fireEvent.mouseDown(screen.getByLabelText(label), {
    clientX: to.lng,
    clientY: to.lat,
    shiftKey: shift,
  });
  fireEvent.mouseMove(document, {
    clientX: to.lng,
    clientY: to.lat,
    shiftKey: shift,
  });
  fireEvent.mouseUp(document, {
    clientX: to.lng,
    clientY: to.lat,
    shiftKey: shift,
  });
};

/** Presses and drags a corner handle without releasing it. */
const holdCornerHandle = (
  label: CornerLabel,
  to: { lat: number; lng: number },
  shift = false,
) => {
  fireEvent.mouseDown(screen.getByLabelText(label), {
    clientX: to.lng,
    clientY: to.lat,
    shiftKey: shift,
  });
  fireEvent.mouseMove(document, {
    clientX: to.lng,
    clientY: to.lat,
    shiftKey: shift,
  });
};

/** Reads the corners of a bounds object recorded by the overlay preview. */
const boundsCorners = (bounds: unknown) => {
  const b = bounds as {
    getSouthWest: () => LatLngLiteral;
    getNorthEast: () => LatLngLiteral;
  };
  return { southWest: b.getSouthWest(), northEast: b.getNorthEast() };
};

describe('four-handle resize mode: image', () => {
  const resizeProps = {
    ...sharedProps,
    geometryEditMode: 'resize' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('shows the four bounding-box handles plus the move handle', () => {
    render(
      <EditableImage obj={imageObject} {...resizeProps} isSelected={true} />,
    );

    expect(
      screen.getAllByLabelText(/Resize image (northwest|northeast|southwest|southeast) corner/),
    ).toHaveLength(4);
    expect(screen.getByLabelText('Move image overlay')).toBeInTheDocument();
    expect(screen.getAllByTestId('marker')).toHaveLength(5);
  });

  it('scales the bounds from the opposite corner, keeping the ratio', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...resizeProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    // Bounds {SW(1,1), NE(5,5)} scaled about the fixed SW corner. The cursor
    // is off the 45° diagonal, so the locked resize projects it onto it:
    // factor 1.5 -> NE(7,7).
    dragCornerHandle('Resize image northeast corner', { lat: 5, lng: 9 });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('img-1', {
      bounds: { southWest: { lat: 1, lng: 1 }, northEast: { lat: 7, lng: 7 } },
    });
  });

  it('lets width and height change independently while Shift is held', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...resizeProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    dragCornerHandle('Resize image northeast corner', { lat: 5, lng: 9 }, true);

    expect(onUpdate).toHaveBeenCalledWith('img-1', {
      bounds: { southWest: { lat: 1, lng: 1 }, northEast: { lat: 5, lng: 9 } },
    });
  });

  it('previews the resize live and keeps the sibling handles welded to the box', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...resizeProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    holdCornerHandle('Resize image northeast corner', { lat: 5, lng: 9 });

    // One live overlay update, and nothing persisted yet.
    expect(leafletCalls.setBounds).toHaveLength(1);
    expect(boundsCorners(leafletCalls.setBounds[0])).toEqual({
      southWest: { lat: 1, lng: 1 },
      northEast: { lat: 7, lng: 7 },
    });
    expect(onUpdate).not.toHaveBeenCalled();

    // The untouched handles follow the scaled box.
    const handlePositions = leafletCalls.setLatLng.map((call) => call.position);
    expect(handlePositions).toEqual(
      expect.arrayContaining([
        { lat: 7, lng: 1 }, // north-west
        { lat: 7, lng: 7 }, // north-east
        { lat: 1, lng: 7 }, // south-east
      ]),
    );

    fireEvent.mouseUp(document, { clientX: 9, clientY: 5 });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('follows Shift when it is pressed part-way through the drag', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...resizeProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    // The same cursor position, locked first and unlocked after.
    fireEvent.mouseDown(screen.getByLabelText('Resize image northeast corner'), {
      clientX: 9,
      clientY: 5,
    });
    fireEvent.mouseMove(document, { clientX: 9, clientY: 5 });
    expect(boundsCorners(leafletCalls.setBounds[0]).northEast).toEqual({
      lat: 7,
      lng: 7,
    });

    fireEvent.mouseMove(document, { clientX: 9, clientY: 5, shiftKey: true });
    expect(boundsCorners(leafletCalls.setBounds[1]).northEast).toEqual({
      lat: 5,
      lng: 9,
    });

    fireEvent.mouseUp(document, { clientX: 9, clientY: 5, shiftKey: true });
    expect(onUpdate).toHaveBeenCalledWith('img-1', {
      bounds: { southWest: { lat: 1, lng: 1 }, northEast: { lat: 5, lng: 9 } },
    });
  });

  it('anchors the resize at the opposite corner for the other three corners', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...resizeProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    // Dragging the south-west corner about the fixed NE(5,5): cursor (2,2) in
    // projected units -> factor 0.5 -> SW(3,3).
    dragCornerHandle('Resize image southwest corner', { lat: 3, lng: 3 });

    expect(onUpdate).toHaveBeenCalledWith('img-1', {
      bounds: { southWest: { lat: 3, lng: 3 }, northEast: { lat: 5, lng: 5 } },
    });
  });
});

describe('four-handle resize mode: lines and polygons', () => {
  const resizeProps = {
    ...sharedProps,
    geometryEditMode: 'resize' as const,
  };

  const box: MapPolygon = {
    id: 'poly-1',
    layerId: 'layer-1',
    type: 'polygon',
    title: 'A rectangle',
    description: '',
    positions: [
      { lat: 0, lng: 0 }, // south-west
      { lat: 0, lng: 10 }, // south-east
      { lat: 10, lng: 10 }, // north-east
      { lat: 10, lng: 0 }, // north-west
    ],
  };

  const line: MapPolyline = {
    id: 'line-1',
    layerId: 'layer-1',
    type: 'polyline',
    title: 'A line',
    description: '',
    positions: [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it.each([
    ['polygon', box, 'polygon'],
    ['polyline', line, 'line'],
  ])('shows four bounding-box handles and the move handle for a %s', (_label, obj, noun) => {
    const Editor = noun === 'line' ? EditablePolyline : EditablePolygon;
    render(<Editor obj={obj} {...resizeProps} isSelected={true} />);

    expect(
      screen.getAllByLabelText(new RegExp(`Resize ${noun} (northwest|northeast|southwest|southeast) corner`)),
    ).toHaveLength(4);
    expect(screen.getByLabelText(`Move ${noun}`)).toBeInTheDocument();
    expect(screen.getAllByTestId('marker')).toHaveLength(5);
  });

  it('scales every vertex of a polygon from the opposite corner', () => {
    const onUpdate = vi.fn();
    render(
      <EditablePolygon obj={box} {...resizeProps} isSelected={true} onUpdate={onUpdate} />,
    );

    // Doubles the box about its fixed south-west corner: the cursor sits on
    // the diagonal, so width and height grow by the same factor.
    dragCornerHandle('Resize polygon northeast corner', { lat: 20, lng: 20 });

    expect(onUpdate).toHaveBeenCalledWith('poly-1', {
      positions: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 20 },
        { lat: 20, lng: 20 },
        { lat: 20, lng: 0 },
      ],
    });
  });

  it('scales every vertex of a polyline from the opposite corner', () => {
    const onUpdate = vi.fn();
    render(
      <EditablePolyline obj={line} {...resizeProps} isSelected={true} onUpdate={onUpdate} />,
    );

    // The diagonal from the fixed south-west end (lng 2, lat 1) reaches
    // (lng 5, lat 4) at factor 1.5.
    dragCornerHandle('Resize line northeast corner', { lat: 3, lng: 6 });

    expect(onUpdate).toHaveBeenCalledWith('line-1', {
      positions: [
        { lat: 1, lng: 2 },
        { lat: 4, lng: 5 },
      ],
    });
  });

  it('stretches a polygon on one axis only while Shift is held', () => {
    const onUpdate = vi.fn();
    render(
      <EditablePolygon obj={box} {...resizeProps} isSelected={true} onUpdate={onUpdate} />,
    );

    // Doubles the width and leaves the height alone.
    dragCornerHandle('Resize polygon northeast corner', { lat: 10, lng: 20 }, true);

    expect(onUpdate).toHaveBeenCalledWith('poly-1', {
      positions: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 20 },
        { lat: 10, lng: 20 },
        { lat: 10, lng: 0 },
      ],
    });
  });

  it('previews the resized shape live and commits only when the drag ends', () => {
    const onUpdate = vi.fn();
    render(
      <EditablePolygon obj={box} {...resizeProps} isSelected={true} onUpdate={onUpdate} />,
    );

    holdCornerHandle('Resize polygon northeast corner', { lat: 20, lng: 20 });

    expect(leafletCalls.setLatLngs).toHaveLength(1);
    expect(leafletCalls.setLatLngs[0]).toEqual([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 20 },
      { lat: 20, lng: 20 },
      { lat: 20, lng: 0 },
    ]);
    // The move handle and the three untouched corners follow the shape.
    expect(leafletCalls.setLatLng).toHaveLength(5);
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.mouseUp(document, { clientX: 20, clientY: 20 });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(leafletCalls.setLatLngs).toHaveLength(2);
  });

  it('moves the whole shape without resizing it from the move handle', () => {
    const onUpdate = vi.fn();
    render(
      <EditablePolygon obj={box} {...resizeProps} isSelected={true} onUpdate={onUpdate} />,
    );

    // The rectangle's centre is {lat: 5, lng: 5}; dragging it to {5, 7} shifts
    // every vertex by 2 lng and leaves the bounding box the same size.
    fireEvent.dragEnd(screen.getByLabelText('Move polygon'), {
      target: markerAt({ lat: 5, lng: 7 }),
    });

    expect(onUpdate).toHaveBeenCalledWith('poly-1', {
      positions: [
        { lat: 0, lng: 2 },
        { lat: 0, lng: 12 },
        { lat: 10, lng: 12 },
        { lat: 10, lng: 2 },
      ],
    });
  });
});

describe('individual vertex editing mode', () => {
  const vertexProps = {
    ...sharedProps,
    geometryEditMode: 'vertices' as const,
  };

  const triangle: MapPolygon = {
    id: 'poly-2',
    layerId: 'layer-1',
    type: 'polygon',
    title: 'A triangle',
    description: '',
    positions: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
    ],
  };

  /** A shape with more vertices than the editor is willing to handle. */
  const hugePolygon: MapPolygon = {
    ...triangle,
    id: 'poly-3',
    positions: Array.from({ length: 101 }, (_, i) => ({ lat: i / 100, lng: i / 100 })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('shows one handle per stored vertex and no bounding-box handles', () => {
    render(
      <EditablePolygon obj={triangle} {...vertexProps} isSelected={true} />,
    );

    // Three vertices plus the centre move handle.
    expect(screen.getAllByTestId('marker')).toHaveLength(4);
    expect(
      screen.queryByLabelText(/Resize polygon (northwest|northeast|southwest|southeast) corner/),
    ).not.toBeInTheDocument();
  });

  it('moves only the vertex under the handle', () => {
    const onUpdate = vi.fn();
    render(
      <EditablePolygon
        obj={triangle}
        {...vertexProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    const firstVertex = screen.getAllByTestId('marker')[0];

    fireEvent.drag(firstVertex, { target: markerAt({ lat: 4, lng: 1 }) });
    // The path follows the vertex live, before anything is persisted.
    expect(leafletCalls.setLatLngs).toHaveLength(1);
    expect(leafletCalls.setLatLngs[0][0]).toEqual({ lat: 4, lng: 1 });
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.dragEnd(firstVertex, { target: markerAt({ lat: 4, lng: 1 }) });

    expect(onUpdate).toHaveBeenCalledWith('poly-2', {
      positions: [
        { lat: 4, lng: 1 },
        { lat: 0, lng: 10 },
        { lat: 10, lng: 10 },
      ],
    });
  });

  it('keeps the vertex limit for huge shapes but still offers four-handle resize', () => {
    const { unmount } = render(
      <EditablePolygon obj={hugePolygon} {...vertexProps} isSelected={true} />,
    );

    // 101 vertices are far past the limit, so no per-vertex handles are drawn.
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
    unmount();

    resetLeafletCalls();
    render(
      <EditablePolygon
        obj={hugePolygon}
        {...sharedProps}
        geometryEditMode="resize"
        isSelected={true}
      />,
    );

    // The whole shape can still be resized from its bounding box.
    expect(screen.getAllByTestId('marker')).toHaveLength(5);
    expect(
      screen.getAllByLabelText(/Resize polygon (northwest|northeast|southwest|southeast) corner/),
    ).toHaveLength(4);
  });

  it('adjusts one image corner independently instead of enforcing the ratio', () => {
    const onUpdate = vi.fn();
    render(
      <EditableImage
        obj={imageObject}
        {...vertexProps}
        isSelected={true}
        onUpdate={onUpdate}
      />,
    );

    const corner = screen.getByLabelText('Resize image northeast corner');
    fireEvent.drag(corner, { target: markerAt({ lat: 5, lng: 6 }) });
    fireEvent.dragEnd(corner, { target: markerAt({ lat: 5, lng: 6 }) });

    // A square 4x4 bounds becomes 4x5: no aspect lock in this mode.
    expect(onUpdate).toHaveBeenCalledWith('img-1', {
      bounds: { southWest: { lat: 1, lng: 1 }, northEast: { lat: 5, lng: 6 } },
    });
  });
});

describe('circle four-corner resizing', () => {
  const circle: MapCircle = {
    id: 'c-2',
    layerId: 'layer-1',
    type: 'circle',
    title: 'A circle',
    description: '',
    center: { lat: 1, lng: 2 },
    radius: 100,
  };

  /** Projected radius of the fixture under the mocked linear projection. */
  const radiusPx = circle.radius * PX_PER_METER;

  /** The four bounding-box corners, with the direction each one grows in. */
  const corners = [
    ['northwest', { lng: -1, lat: 1 }],
    ['northeast', { lng: 1, lat: 1 }],
    ['southwest', { lng: -1, lat: -1 }],
    ['southeast', { lng: 1, lat: -1 }],
  ] as const;

  /**
   * Drags one corner of the circle's bounding box out to `scale` times its
   * distance from the diagonally opposite corner, and returns that fixed
   * anchor. The result should be a circle of `scale * radius` whose bounds
   * still touch the anchor.
   */
  const dragCircleCorner = (
    corner: (typeof corners)[number][0],
    signs: { lng: number; lat: number },
    scale: number,
    shift = false,
  ) => {
    const anchor = {
      x: circle.center.lng - signs.lng * radiusPx,
      y: -circle.center.lat + signs.lat * radiusPx,
    };
    const start = {
      x: circle.center.lng + signs.lng * radiusPx,
      y: -circle.center.lat - signs.lat * radiusPx,
    };
    dragCornerHandle(
      `Resize circle ${corner} corner`,
      {
        lng: anchor.x + scale * (start.x - anchor.x),
        lat: -(anchor.y + scale * (start.y - anchor.y)),
      },
      shift,
    );
    return anchor;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it.each(['resize', 'vertices'] as const)(
    'shows four bounding-box handles and the centre handle in %s mode',
    (mode) => {
      render(
        <EditableCircle obj={circle} {...sharedProps} geometryEditMode={mode} isSelected={true} />,
      );

      expect(
        screen.getAllByLabelText(/Resize circle (northwest|northeast|southwest|southeast) corner/),
      ).toHaveLength(4);
      expect(screen.getByLabelText('Move circle')).toBeInTheDocument();
    },
  );

  it.each(corners)(
    'resizes the circle from the %s corner while keeping it round and anchored',
    (corner, signs) => {
      const onUpdate = vi.fn();
      render(
        <EditableCircle obj={circle} {...sharedProps} isSelected={true} onUpdate={onUpdate} />,
      );

      const anchor = dragCircleCorner(corner, signs, 2);

      const [id, rawUpdates] = onUpdate.mock.calls[0];
      const updates = rawUpdates as Partial<MapCircle>;
      expect(id).toBe('c-2');
      // Stored as a centre and a single radius, never as ellipse axes.
      expect(Object.keys(updates).sort()).toEqual(['center', 'radius']);
      expect(updates.radius).toBeCloseTo(2 * circle.radius, 6);

      // The opposite corner of the grown bounds lands back on the anchor.
      const grownPx = (updates.radius as number) * PX_PER_METER;
      expect(updates.center!.lng - signs.lng * grownPx).toBeCloseTo(anchor.x, 6);
      expect(-updates.center!.lat + signs.lat * grownPx).toBeCloseTo(anchor.y, 6);
    },
  );

  it('is not distorted by Shift', () => {
    const locked = vi.fn();
    const shifted = vi.fn();

    const { unmount } = render(
      <EditableCircle obj={circle} {...sharedProps} isSelected={true} onUpdate={locked} />,
    );
    dragCircleCorner('northeast', { lng: 1, lat: 1 }, 2, false);
    unmount();

    resetLeafletCalls();
    render(
      <EditableCircle obj={circle} {...sharedProps} isSelected={true} onUpdate={shifted} />,
    );
    dragCircleCorner('northeast', { lng: 1, lat: 1 }, 2, true);

    expect(shifted.mock.calls).toEqual(locked.mock.calls);
  });

  it('previews the new circle live and commits on release', () => {
    const onUpdate = vi.fn();
    render(
      <EditableCircle obj={circle} {...sharedProps} isSelected={true} onUpdate={onUpdate} />,
    );

    holdCornerHandle('Resize circle northeast corner', {
      lng: circle.center.lng + 3 * radiusPx,
      lat: circle.center.lat + 3 * radiusPx,
    });

    expect(leafletCalls.setCircleCenter).toHaveLength(1);
    expect(leafletCalls.setRadius).toHaveLength(1);
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.mouseUp(document, {
      clientX: circle.center.lng + 3 * radiusPx,
      clientY: circle.center.lat + 3 * radiusPx,
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('still moves the circle from its centre handle', () => {
    const onUpdate = vi.fn();
    render(
      <EditableCircle obj={circle} {...sharedProps} isSelected={true} onUpdate={onUpdate} />,
    );

    fireEvent.dragEnd(screen.getByLabelText('Move circle'), {
      target: markerAt({ lat: 4, lng: 2 }),
    });

    expect(onUpdate).toHaveBeenCalledWith('c-2', { center: { lat: 4, lng: 2 } });
  });
});

describe('map stays still during handle gestures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('suspends map dragging for a resize gesture and restores it on release', () => {
    render(
      <EditableImage
        obj={imageObject}
        {...sharedProps}
        geometryEditMode="resize"
        isSelected={true}
        onUpdate={vi.fn()}
      />,
    );

    holdCornerHandle('Resize image northeast corner', { lat: 5, lng: 9 });

    expect(leafletCalls.draggingDisable).toHaveBeenCalledTimes(1);
    expect(leafletCalls.draggingEnable).not.toHaveBeenCalled();

    fireEvent.mouseUp(document, { clientX: 9, clientY: 5 });

    expect(leafletCalls.draggingEnable).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['image in resize mode', <EditableImage obj={imageObject} {...sharedProps} geometryEditMode="resize" isSelected={true} />],
    ['polygon in vertex mode', <EditablePolygon obj={triangleFixture} {...sharedProps} isSelected={true} />],
  ])('keeps %s handles from bubbling to the map', (_label, element) => {
    render(element);

    // Native marker gestures are consumed by the handle, and the custom
    // resize gesture disables map dragging, so the viewport never pans.
    const handles = screen.getAllByTestId('marker');
    expect(handles.length).toBeGreaterThan(0);
    handles.forEach((handle) => {
      expect(handle).toHaveAttribute('data-bubbling', 'false');
    });
  });
});

describe('trailing-click suppression at drag end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLeafletCalls();
  });

  it('arms when a point marker drag ends', () => {
    const point: MapPoint = {
      id: 'p-1',
      layerId: 'layer-1',
      type: 'point',
      title: 'A point',
      description: '',
      position: { lat: 1, lng: 2 },
    };
    render(
      <EditablePoint obj={point} {...sharedProps} isSelected={true} onUpdate={vi.fn()} />,
    );

    fireEvent.dragEnd(screen.getByTestId('marker'), {
      target: markerAt({ lat: 3, lng: 4 }),
    });

    expect(suppressTrailingClickSpy).toHaveBeenCalledTimes(1);
  });

  it('arms when the circle move handle drag ends', () => {
    const circle: MapCircle = {
      id: 'c-1',
      layerId: 'layer-1',
      type: 'circle',
      title: 'A circle',
      description: '',
      center: { lat: 1, lng: 2 },
      radius: 100,
    };
    render(<EditableCircle obj={circle} {...sharedProps} isSelected={true} onUpdate={vi.fn()} />);

    fireEvent.dragEnd(screen.getByLabelText('Move circle'), {
      target: markerAt({ lat: 4, lng: 2 }),
    });

    expect(suppressTrailingClickSpy).toHaveBeenCalledTimes(1);
  });

  it('arms when the image centre move handle drag ends', () => {
    render(
      <EditableImage obj={imageObject} {...sharedProps} isSelected={true} onUpdate={vi.fn()} />,
    );

    fireEvent.dragEnd(screen.getByLabelText('Move image overlay'), {
      target: markerAt({ lat: 3, lng: 4 }),
    });

    expect(suppressTrailingClickSpy).toHaveBeenCalledTimes(1);
  });

  it('arms when an image vertex-mode corner marker drag ends', () => {
    render(
      <EditableImage
        obj={imageObject}
        {...sharedProps}
        geometryEditMode="vertices"
        isSelected={true}
        onUpdate={vi.fn()}
      />,
    );

    // In vertex mode the four corner markers are native-draggable dots.
    fireEvent.dragEnd(screen.getAllByLabelText('Resize image northeast corner')[0], {
      target: markerAt({ lat: 5, lng: 6 }),
    });

    expect(suppressTrailingClickSpy).toHaveBeenCalledTimes(1);
  });

  const line: MapPolyline = {
    id: 'l-9',
    layerId: 'layer-1',
    type: 'polyline',
    title: 'A line',
    description: '',
    positions: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
    ],
  };

  it.each(['polyline', 'polygon'] as const)(
    'arms when a %s vertex drag ends in vertex mode',
    (noun) => {
      const obj = noun === 'polyline' ? line : ({ ...triangleFixture } as MapPolygon);
      const Editor = noun === 'polyline' ? EditablePolyline : EditablePolygon;
      render(
        <Editor obj={obj} {...sharedProps} isSelected={true} onUpdate={vi.fn()} />,
      );

      // ShapeHandles render the vertices first, the centre move handle last.
      const vertex = screen.getAllByTestId('marker')[0];
      fireEvent.dragEnd(vertex, { target: markerAt({ lat: 4, lng: 1 }) });

      expect(suppressTrailingClickSpy).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['polyline', 'polygon'] as const)(
    'arms when a %s shape-move drag ends in vertex mode',
    (noun) => {
      const obj = noun === 'polyline' ? line : ({ ...triangleFixture } as MapPolygon);
      const Editor = noun === 'polyline' ? EditablePolyline : EditablePolygon;
      render(
        <Editor obj={obj} {...sharedProps} isSelected={true} onUpdate={vi.fn()} />,
      );

      const moveHandle = screen.getAllByTestId('marker').at(-1)!;
      fireEvent.dragEnd(moveHandle, { target: markerAt({ lat: 5, lng: 5 }) });

      expect(suppressTrailingClickSpy).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['line', 'polyline'],
    ['polygon', 'polygon'],
  ] as const)(
    'arms when a %s move handle drag ends in resize mode',
    (noun, type) => {
      const obj =
        type === 'polyline'
          ? ({
              id: 'l-9',
              layerId: 'layer-1',
              type: 'polyline',
              title: 'A line',
              description: '',
              positions: [
                { lat: 0, lng: 0 },
                { lat: 0, lng: 10 },
              ],
            } as MapPolyline)
          : ({ ...triangleFixture } as MapPolygon);
      const Editor = type === 'polyline' ? EditablePolyline : EditablePolygon;
      render(
        <Editor
          obj={obj}
          {...sharedProps}
          geometryEditMode="resize"
          isSelected={true}
          onUpdate={vi.fn()}
        />,
      );

      fireEvent.dragEnd(screen.getByLabelText(`Move ${noun}`), {
        target: markerAt({ lat: 5, lng: 5 }),
      });

      expect(suppressTrailingClickSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('arms when a custom bounding-box resize gesture is released', () => {
    render(
      <EditableImage
        obj={imageObject}
        {...sharedProps}
        geometryEditMode="resize"
        isSelected={true}
        onUpdate={vi.fn()}
      />,
    );

    dragCornerHandle('Resize image northeast corner', { lat: 5, lng: 9 });

    expect(suppressTrailingClickSpy).toHaveBeenCalledTimes(1);
  });
});
