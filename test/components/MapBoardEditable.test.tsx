import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import L from 'leaflet';
import type { LatLngLiteral } from 'leaflet';
import {
  EditableCircle,
  EditableImage,
  EditablePoint,
  EditablePolygon,
  EditablePolyline,
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
}));

/** Clears the recorded Leaflet calls between tests. */
const resetLeafletCalls = () => {
  leafletCalls.setBounds = [];
  leafletCalls.setLatLng = [];
  leafletCalls.setLatLngs = [];
  leafletCalls.setRadius = [];
  leafletCalls.setCircleCenter = [];
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
          eventHandlers,
        }: {
          eventHandlers?: Record<string, DragEndHandler>;
        },
        ref: React.Ref<unknown>,
      ) => {
        // The live drag previews call through these Leaflet path methods, so
        // tests observe them the same way the map would.
        React.useImperativeHandle(ref, () => ({
          setLatLngs: (positions: LatLngLiteral[]) => {
            leafletCalls.setLatLngs.push(positions);
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
          ...convertEventHandlers(eventHandlers),
        });
      },
    );

  return {
    Marker: React.forwardRef(
      (
        {
          title,
          bubblingMouseEvents,
          eventHandlers,
        }: {
          title?: string;
          bubblingMouseEvents?: boolean;
          eventHandlers?: Record<string, DragEndHandler>;
        },
        ref: React.Ref<unknown>,
      ) => {
        React.useImperativeHandle(ref, () => ({
          setLatLng: (position: LatLngLiteral) => {
            leafletCalls.setLatLng.push({ position });
          },
        }));
        return React.createElement('div', {
          'data-testid': 'marker',
          title: title,
          'aria-label': title,
          // Recorded so tests can assert handles never reach the map itself.
          'data-bubbling': String(bubblingMouseEvents !== false),
          ...convertEventHandlers(eventHandlers),
        });
      },
    ),
    ImageOverlay: React.forwardRef(
      (
        {
          url,
          alt,
          children,
          eventHandlers,
        }: {
          url?: string;
          alt?: string;
          children?: React.ReactNode;
          eventHandlers?: Record<string, DragEndHandler>;
        },
        ref: React.Ref<unknown>,
      ) => {
        React.useImperativeHandle(ref, () => ({
          setBounds: (bounds: unknown) => {
            leafletCalls.setBounds.push(bounds);
          },
        }));
        return React.createElement('div', {
          'data-testid': 'image-overlay',
          className: 'image-overlay',
          ...convertEventHandlers(eventHandlers),
        },
          React.createElement('img', { src: url, alt: alt || 'Map image' }),
          children,
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
      getZoom: () => 13,
      // A linear projection whose inverse round-trips, so resize maths stay
      // readable: x = lng, y = -lat.
      project: (ll: { lat: number; lng: number }) => ({ x: ll.lng, y: -ll.lat }),
      // `-0` would leak out of a plain negation and break `toEqual`, so the
      // inverse keeps zeros positive.
      unproject: (p: { x: number; y: number }) => ({
        lat: p.y === 0 ? 0 : -p.y,
        lng: p.x === 0 ? 0 : p.x,
      }),
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
