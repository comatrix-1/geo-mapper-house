import { useMemo, useRef, type MutableRefObject } from "react";
import {
  Marker,
  Circle,
  Polyline,
  Polygon,
  ImageOverlay,
  useMap,
} from "react-leaflet";
import Leaflet from "leaflet";
import type { LatLngLiteral, LatLngTuple, LeafletMouseEvent } from "leaflet";
import type {
  GeometryEditMode,
  MapCircle,
  MapImage,
  MapImageBounds,
  MapObject,
  MapPoint,
  MapPolygon,
  MapPolyline,
  LayerStyle,
} from "../types";
import { getCentroid } from "../utils/geoUtils";
import { getVertexResizeCursors } from "../utils/resizeCursor";
import { suppressTrailingClick } from "../utils/suppressTrailingClick";
import {
  IMAGE_CORNERS,
  getImageCenter,
  getImageCornerPositions,
  resizeImageBounds,
  translateImageBounds,
  type ImageCorner,
} from "../utils/imageOverlay";
import {
  cornerPoint,
  metersToPixels,
  resizeCircle,
  resizeLatLngBounds,
  resizeLatLngVertices,
  type ResizeMap,
} from "../utils/geometryResize";
import {
  createMarkerIcon,
  createMoveHandleIcon,
  createVertexIcon,
} from "./Icons";

// Limit vertices for showing edit handles to prevent crash on large imports (e.g. detailed country borders)
const VERTEX_LIMIT = 100;

/** The four bounding-box corners of a shape, as geographic positions. */
type CornerPositions = Record<ImageCorner, LatLngLiteral>;

type DragEvent = { target: { getLatLng: () => LatLngLiteral } };

/**
 * Adapts a real Leaflet map to the structural `ResizeMap` the geometry helpers
 * need, bridging Leaflet's nominal `Point` type and the helpers' plain points.
 */
const toResizeMap = (map: Leaflet.Map): ResizeMap => ({
  getZoom: () => map.getZoom(),
  project: (latlng) => map.project(latlng, map.getZoom()),
  unproject: (point) =>
    map.unproject(point as Leaflet.PointExpression, map.getZoom()),
  distance: (a, b) => map.distance(a, b),
});

/** Accessible labels for each image resize handle. */
const IMAGE_CORNER_TITLES: Record<ImageCorner, string> = {
  northWest: "Resize image northwest corner",
  northEast: "Resize image northeast corner",
  southWest: "Resize image southwest corner",
  southEast: "Resize image southeast corner",
};

const shapeCornerTitles = (noun: string): Record<ImageCorner, string> => ({
  northWest: `Resize ${noun} northwest corner`,
  northEast: `Resize ${noun} northeast corner`,
  southWest: `Resize ${noun} southwest corner`,
  southEast: `Resize ${noun} southeast corner`,
});

/**
 * Geographic bounding-box corners of a set of positions. These are zoom
 * independent: the projected box maps back monotonically to the lat/lng min
 * and max, so handles stay put across a zoom change.
 */
const geoBBoxCorners = (positions: LatLngLiteral[]): CornerPositions => {
  if (positions.length === 0) {
    const zero = { lat: 0, lng: 0 };
    return { northWest: zero, northEast: zero, southWest: zero, southEast: zero };
  }
  const lats = positions.map((p) => p.lat);
  const lngs = positions.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    northWest: { lat: maxLat, lng: minLng },
    northEast: { lat: maxLat, lng: maxLng },
    southWest: { lat: minLat, lng: minLng },
    southEast: { lat: minLat, lng: maxLng },
  };
};

/** Projected bounding-box corners of a circle's current center and radius. */
const circleCorners = (
  map: Leaflet.Map,
  center: LatLngLiteral,
  radiusMeters: number,
): CornerPositions => {
  const zoom = map.getZoom();
  const cp = map.project(center, zoom);
  const rPx = metersToPixels(radiusMeters, zoom);
  const b = {
    minX: cp.x - rPx,
    minY: cp.y - rPx,
    maxX: cp.x + rPx,
    maxY: cp.y + rPx,
  };
  const up = (corner: ImageCorner) =>
    map.unproject(cornerPoint(b, corner) as Leaflet.PointExpression, zoom);
  return {
    northWest: up("northWest"),
    northEast: up("northEast"),
    southWest: up("southWest"),
    southEast: up("southEast"),
  };
};

/**
 * Custom pointer drag for a bounding-box resize handle.
 *
 * Leaflet's native marker dragging aborts its start when Shift is held and
 * forces the handle to sit under the cursor, so it cannot express an
 * aspect-locked "welded" corner resize. This bypasses it: we stop the map's own
 * drag handling, track the pointer at document level, and read Shift live from
 * every move so the lock can toggle mid-drag. The caller positions the handle
 * at the computed corner rather than the cursor.
 */
const beginHandleDrag = (
  map: Leaflet.Map,
  domEvent: MouseEvent,
  onMove: (latlng: LatLngLiteral, shift: boolean) => void,
  onEnd: (latlng: LatLngLiteral, shift: boolean) => void,
): void => {
  Leaflet.DomEvent.stop(domEvent);
  // Keep the viewport stationary for the whole gesture.
  map.dragging?.disable?.();

  const handleMove = (ev: MouseEvent) => onMove(map.mouseEventToLatLng(ev), ev.shiftKey);
  const handleUp = (ev: MouseEvent) => {
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("mouseup", handleUp);
    map.dragging?.enable?.();
    onEnd(map.mouseEventToLatLng(ev), ev.shiftKey);
    // The pointer is rarely back on the handle icon when the drag ends, so
    // the browser fires the trailing click on the map container and Leaflet's
    // own drag guard never sees the dragged layer. Eat that click so the map
    // handler does not clear the selection right after the gesture.
    suppressTrailingClick();
  };

  document.addEventListener("mousemove", handleMove);
  document.addEventListener("mouseup", handleUp);
};

interface CornerResizeHandlesProps {
  /** Committed corner positions to render the handles from. */
  corners: CornerPositions;
  /** Parent-owned so a move drag can reposition the handles too. */
  handleRefs: MutableRefObject<(Leaflet.Marker | null)[]>;
  titles: Record<ImageCorner, string>;
  /**
   * Applies a live resize for the dragged corner and returns the new corner
   * positions. The handle markers are repositioned to these by the caller.
   */
  onCornerMove: (corner: ImageCorner, latlng: LatLngLiteral, aspectLocked: boolean) => CornerPositions;
  /** Applies the final resize and commits the object update. */
  onCornerCommit: (corner: ImageCorner, latlng: LatLngLiteral, aspectLocked: boolean) => CornerPositions;
}

/** Four bounding-box resize handles driven by the custom pointer drag. */
const CornerResizeHandles = ({
  corners,
  handleRefs,
  titles,
  onCornerMove,
  onCornerCommit,
}: CornerResizeHandlesProps) => {
  const map = useMap();
  const cursors = useMemo(
    () => getVertexResizeCursors(IMAGE_CORNERS.map((corner) => corners[corner])),
    [corners],
  );

  const reposition = (next: CornerPositions) => {
    IMAGE_CORNERS.forEach((corner, index) => {
      handleRefs.current[index]?.setLatLng(next[corner]);
    });
  };

  const handleMouseDown =
    (corner: ImageCorner) => (e: LeafletMouseEvent) => {
      const domEvent = (e.originalEvent ?? (e as unknown as MouseEvent)) as MouseEvent;
      beginHandleDrag(
        map,
        domEvent,
        (latlng, shift) => reposition(onCornerMove(corner, latlng, !shift)),
        (latlng, shift) => reposition(onCornerCommit(corner, latlng, !shift)),
      );
    };

  return (
    <>
      {IMAGE_CORNERS.map((corner, index) => (
        <Marker
          key={corner}
          ref={(marker) => {
            handleRefs.current[index] = marker;
          }}
          position={corners[corner]}
          icon={createVertexIcon(cursors[index])}
          draggable={false}
          bubblingMouseEvents={false}
          title={titles[corner]}
          eventHandlers={{ mousedown: handleMouseDown(corner) }}
        />
      ))}
    </>
  );
};

export interface EditableObjectProps {
  obj: MapObject;
  style: LayerStyle;
  isSelected: boolean;
  /** True when the map is not in a drawing mode, i.e. objects are clickable. */
  interactive: boolean;
  /** Selection-scoped geometry editing mode (resize / vertices). */
  geometryEditMode: GeometryEditMode;
  /**
   * Selects the object. Clicking an object on the map leaves the viewport
   * alone — only the sidebar focuses an object by moving the map onto it.
   */
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<MapObject>) => void;
}

/** Shared vertex-drag logic: live-update a Leaflet path's lat/lngs. */
const dragVertexOn = (
  ref: { current: unknown },
  positions: LatLngLiteral[],
  idx: number,
  e: DragEvent
) => {
  const newPos = e.target.getLatLng();
  const currentLatLngs = [...positions];
  currentLatLngs[idx] = newPos;
  const path = ref.current as { setLatLngs: (l: LatLngLiteral[]) => void } | null;
  if (path) path.setLatLngs(currentLatLngs);
};

/** Shared vertex-drag-end logic: commit the new positions via onUpdate. */
const dragVertexEnd = (
  positions: LatLngLiteral[],
  idx: number,
  e: DragEvent
): LatLngLiteral[] => {
  const newPositions = [...positions];
  newPositions[idx] = e.target.getLatLng();
  return newPositions;
};

/** Shared shape-move logic: offset every vertex by the handle's delta. */
const dragShapeOn = (
  ref: { current: unknown },
  vertexRefs: { current: (Leaflet.Marker | null)[] },
  positions: LatLngLiteral[],
  center: LatLngLiteral,
  e: DragEvent
) => {
  const newCenter = e.target.getLatLng();
  const latDiff = newCenter.lat - center.lat;
  const lngDiff = newCenter.lng - center.lng;
  const newPositions = positions.map((p) => ({
    lat: p.lat + latDiff,
    lng: p.lng + lngDiff,
  }));
  const path = ref.current as { setLatLngs: (l: LatLngLiteral[]) => void } | null;
  if (path) path.setLatLngs(newPositions);
  // Keep the vertex handles glued to the shape while it moves; the committed
  // positions only flow back through props on drag end.
  vertexRefs.current.forEach((marker, i) => {
    const pos = newPositions[i];
    if (marker && pos) marker.setLatLng(pos);
  });
};

/** Shared shape-move-end logic: commit the translated positions. */
const dragShapeEnd = (
  positions: LatLngLiteral[],
  center: LatLngLiteral,
  e: DragEvent
): LatLngLiteral[] => {
  const newCenter = e.target.getLatLng();
  const latDiff = newCenter.lat - center.lat;
  const lngDiff = newCenter.lng - center.lng;
  return positions.map((p) => ({
    lat: p.lat + latDiff,
    lng: p.lng + lngDiff,
  }));
};

interface VertexHandlesProps {
  positions: LatLngLiteral[];
  /** Live refs to the vertex markers so a shape move can drag them along. */
  vertexRefs: { current: (Leaflet.Marker | null)[] };
  onVertexDrag: (idx: number, e: DragEvent) => void;
  onVertexDragEnd: (idx: number, e: DragEvent) => void;
  center: LatLngLiteral;
  onCenterDrag: (e: DragEvent) => void;
  onCenterDragEnd: (e: DragEvent) => void;
}

/** Vertex + move-handle markers shared by polyline and polygon editors. */
const ShapeHandles = ({
  positions,
  vertexRefs,
  onVertexDrag,
  onVertexDragEnd,
  center,
  onCenterDrag,
  onCenterDragEnd,
}: VertexHandlesProps) => {
  return (
    <>
      {positions.map((pos, idx) => (
        <Marker
          key={`v-${pos.lat}-${pos.lng}-${idx}`}
          ref={(m) => {
            vertexRefs.current[idx] = m;
          }}
          position={pos}
          // A vertex moves freely in any direction, so it shows the
          // four-way move cursor rather than a resize axis.
          icon={createVertexIcon('move')}
          draggable={true}
          bubblingMouseEvents={false}
          eventHandlers={{
            drag: (e) => onVertexDrag(idx, e),
            dragend: (e) => {
              suppressTrailingClick();
              onVertexDragEnd(idx, e);
            },
          }}
        />
      ))}
      <Marker
        position={center}
        icon={createMoveHandleIcon()}
        draggable={true}
        bubblingMouseEvents={false}
        eventHandlers={{
          drag: onCenterDrag,
          dragend: (e) => {
            suppressTrailingClick();
            onCenterDragEnd(e);
          },
        }}
      />
    </>
  );
};

export const EditablePoint = ({
  obj,
  style,
  isSelected,
  interactive,
  onSelect,
  onUpdate,
}: EditableObjectProps) => {
  const point = obj as MapPoint;
  return (
    <Marker
      position={point.position}
      // Use borderColor as the main color for the point marker
      icon={createMarkerIcon(style.borderColor)}
      draggable={isSelected}
      interactive={interactive}
      // Don't let object clicks bubble to the map: the map click handler
      // clears the selection, which would immediately undo the selection
      // this click just set.
      bubblingMouseEvents={false}
      eventHandlers={{
        click: () => {
          if (interactive) onSelect(point.id);
        },
        // Arm before the browser gets a chance to dispatch the trailing
        // click, so the drag never reads as a background click that clears
        // the selection.
        dragend: (e) => {
          suppressTrailingClick();
          onUpdate(point.id, { position: e.target.getLatLng() });
        },
      }}
    />
  );
};

export const EditableCircle = ({
  obj,
  style,
  isSelected,
  interactive,
  onSelect,
  onUpdate,
}: EditableObjectProps) => {
  const circle = obj as MapCircle;
  const map = useMap();
  const circleRef = useRef<Leaflet.Circle>(null);
  const moveHandleRef = useRef<Leaflet.Marker | null>(null);
  const cornerRefs = useRef<(Leaflet.Marker | null)[]>([]);

  const corners = useMemo(
    () => circleCorners(map, circle.center, circle.radius),
    [map, circle.center, circle.radius],
  );

  const onHandleDrag = (e: DragEvent) => {
    const newPos = e.target.getLatLng();
    if (circleRef.current) {
      circleRef.current.setLatLng(newPos);
    }
  };

  const onHandleDragEnd = (e: DragEvent) => {
    onUpdate(circle.id, { center: e.target.getLatLng() });
  };

  // Circles are always round; Shift has no effect, so `aspectLocked` is unused.
  const applyCircle = (
    corner: ImageCorner,
    latlng: LatLngLiteral,
    commit: boolean,
  ): CornerPositions => {
    const next = resizeCircle(toResizeMap(map), circle.center, circle.radius, corner, latlng);
    circleRef.current?.setLatLng(next.center);
    circleRef.current?.setRadius(next.radiusMeters);
    moveHandleRef.current?.setLatLng(next.center);
    const nextCorners = circleCorners(map, next.center, next.radiusMeters);
    if (commit) {
      onUpdate(circle.id, { center: next.center, radius: next.radiusMeters });
    }
    return nextCorners;
  };

  return (
    <>
      <Circle
        ref={circleRef}
        center={circle.center}
        radius={circle.radius}
        pathOptions={{
          color: style.borderColor,
          weight: style.borderWidth,
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
        }}
        interactive={interactive}
        bubblingMouseEvents={false}
        eventHandlers={{
          click: () => {
            if (interactive) onSelect(circle.id);
          },
        }}
      />
      {isSelected && (
        <>
          <Marker
            ref={moveHandleRef}
            position={circle.center}
            draggable={true}
            bubblingMouseEvents={false}
            title="Move circle"
            icon={createMoveHandleIcon()}
            eventHandlers={{
              drag: onHandleDrag,
              dragend: (e) => {
                suppressTrailingClick();
                onHandleDragEnd(e);
              },
            }}
          />
          <CornerResizeHandles
            corners={corners}
            handleRefs={cornerRefs}
            titles={shapeCornerTitles("circle")}
            onCornerMove={(corner, latlng) => applyCircle(corner, latlng, false)}
            onCornerCommit={(corner, latlng) => applyCircle(corner, latlng, true)}
          />
        </>
      )}
    </>
  );
};

export const EditablePolyline = ({
  obj,
  style,
  isSelected,
  interactive,
  onSelect,
  onUpdate,
  geometryEditMode,
}: EditableObjectProps) => {
  const polyline = obj as MapPolyline;
  const map = useMap();
  const polylineRef = useRef<Leaflet.Polyline>(null);
  const vertexRefs = useRef<(Leaflet.Marker | null)[]>([]);
  const cornerRefs = useRef<(Leaflet.Marker | null)[]>([]);
  const moveHandleRef = useRef<Leaflet.Marker | null>(null);
  const center = getCentroid(polyline.positions);
  const showVertices = polyline.positions.length <= VERTEX_LIMIT;

  const corners = useMemo(
    () => geoBBoxCorners(polyline.positions),
    [polyline.positions],
  );

  const applyResize = (
    corner: ImageCorner,
    latlng: LatLngLiteral,
    aspectLocked: boolean,
    commit: boolean,
  ): CornerPositions => {
    const next = resizeLatLngVertices(toResizeMap(map), polyline.positions, corner, latlng, aspectLocked);
    polylineRef.current?.setLatLngs(next);
    moveHandleRef.current?.setLatLng(getCentroid(next));
    const nextCorners = geoBBoxCorners(next);
    if (commit) onUpdate(polyline.id, { positions: next });
    return nextCorners;
  };

  const onMoveDrag = (e: DragEvent) => {
    const newCenter = e.target.getLatLng();
    const latDiff = newCenter.lat - center.lat;
    const lngDiff = newCenter.lng - center.lng;
    const next = polyline.positions.map((p) => ({ lat: p.lat + latDiff, lng: p.lng + lngDiff }));
    polylineRef.current?.setLatLngs(next);
    const nextCorners = geoBBoxCorners(next);
    IMAGE_CORNERS.forEach((c, i) => cornerRefs.current[i]?.setLatLng(nextCorners[c]));
  };

  const onMoveDragEnd = (e: DragEvent) => {
    onUpdate(polyline.id, { positions: dragShapeEnd(polyline.positions, center, e) });
  };

  return (
    <>
      <Polyline
        ref={polylineRef}
        positions={polyline.positions}
        pathOptions={{
          color: style.borderColor,
          weight: isSelected
            ? Math.max(style.borderWidth + 2, 6)
            : style.borderWidth,
        }}
        interactive={interactive}
        bubblingMouseEvents={false}
        eventHandlers={{
          click: () => {
            if (interactive) onSelect(polyline.id);
          },
        }}
      />
      {isSelected && geometryEditMode === "vertices" && showVertices && (
        <ShapeHandles
          positions={polyline.positions}
          vertexRefs={vertexRefs}
          onVertexDrag={(idx, e) =>
            dragVertexOn(polylineRef, polyline.positions, idx, e)
          }
          onVertexDragEnd={(idx, e) =>
            onUpdate(polyline.id, {
              positions: dragVertexEnd(polyline.positions, idx, e),
            })
          }
          center={center}
          onCenterDrag={(e) =>
            dragShapeOn(polylineRef, vertexRefs, polyline.positions, center, e)
          }
          onCenterDragEnd={(e) =>
            onUpdate(polyline.id, {
              positions: dragShapeEnd(polyline.positions, center, e),
            })
          }
        />
      )}
      {isSelected && geometryEditMode === "resize" && (
        <>
          <Marker
            ref={moveHandleRef}
            position={center}
            icon={createMoveHandleIcon()}
            draggable={true}
            bubblingMouseEvents={false}
            title="Move line"
            eventHandlers={{
              drag: onMoveDrag,
              dragend: (e) => {
                suppressTrailingClick();
                onMoveDragEnd(e);
              },
            }}
          />
          <CornerResizeHandles
            corners={corners}
            handleRefs={cornerRefs}
            titles={shapeCornerTitles("line")}
            onCornerMove={(corner, latlng, locked) => applyResize(corner, latlng, locked, false)}
            onCornerCommit={(corner, latlng, locked) => applyResize(corner, latlng, locked, true)}
          />
        </>
      )}
    </>
  );
};

export const EditablePolygon = ({
  obj,
  style,
  isSelected,
  interactive,
  onSelect,
  onUpdate,
  geometryEditMode,
}: EditableObjectProps) => {
  const polygon = obj as MapPolygon;
  const map = useMap();
  const polygonRef = useRef<Leaflet.Polygon>(null);
  const vertexRefs = useRef<(Leaflet.Marker | null)[]>([]);
  const cornerRefs = useRef<(Leaflet.Marker | null)[]>([]);
  const moveHandleRef = useRef<Leaflet.Marker | null>(null);
  const center = getCentroid(polygon.positions);
  const showVertices = polygon.positions.length <= VERTEX_LIMIT;

  const corners = useMemo(() => geoBBoxCorners(polygon.positions), [polygon.positions]);

  const applyResize = (
    corner: ImageCorner,
    latlng: LatLngLiteral,
    aspectLocked: boolean,
    commit: boolean,
  ): CornerPositions => {
    const next = resizeLatLngVertices(toResizeMap(map), polygon.positions, corner, latlng, aspectLocked);
    polygonRef.current?.setLatLngs(next);
    moveHandleRef.current?.setLatLng(getCentroid(next));
    const nextCorners = geoBBoxCorners(next);
    if (commit) onUpdate(polygon.id, { positions: next });
    return nextCorners;
  };

  const onMoveDrag = (e: DragEvent) => {
    const newCenter = e.target.getLatLng();
    const latDiff = newCenter.lat - center.lat;
    const lngDiff = newCenter.lng - center.lng;
    const next = polygon.positions.map((p) => ({ lat: p.lat + latDiff, lng: p.lng + lngDiff }));
    polygonRef.current?.setLatLngs(next);
    const nextCorners = geoBBoxCorners(next);
    IMAGE_CORNERS.forEach((c, i) => cornerRefs.current[i]?.setLatLng(nextCorners[c]));
  };

  const onMoveDragEnd = (e: DragEvent) => {
    onUpdate(polygon.id, { positions: dragShapeEnd(polygon.positions, center, e) });
  };

  return (
    <>
      <Polygon
        ref={polygonRef}
        positions={polygon.positions}
        pathOptions={{
          color: style.borderColor,
          weight: isSelected ? style.borderWidth + 2 : style.borderWidth,
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
        }}
        interactive={interactive}
        bubblingMouseEvents={false}
        eventHandlers={{
          click: () => {
            if (interactive) onSelect(polygon.id);
          },
        }}
      />
      {isSelected && geometryEditMode === "vertices" && showVertices && (
        <ShapeHandles
          positions={polygon.positions}
          vertexRefs={vertexRefs}
          onVertexDrag={(idx, e) =>
            dragVertexOn(polygonRef, polygon.positions, idx, e)
          }
          onVertexDragEnd={(idx, e) =>
            onUpdate(polygon.id, {
              positions: dragVertexEnd(polygon.positions, idx, e),
            })
          }
          center={center}
          onCenterDrag={(e) =>
            dragShapeOn(polygonRef, vertexRefs, polygon.positions, center, e)
          }
          onCenterDragEnd={(e) =>
            onUpdate(polygon.id, {
              positions: dragShapeEnd(polygon.positions, center, e),
            })
          }
        />
      )}
      {isSelected && geometryEditMode === "resize" && (
        <>
          <Marker
            ref={moveHandleRef}
            position={center}
            icon={createMoveHandleIcon()}
            draggable={true}
            bubblingMouseEvents={false}
            title="Move polygon"
            eventHandlers={{
              drag: onMoveDrag,
              dragend: (e) => {
                suppressTrailingClick();
                onMoveDragEnd(e);
              },
            }}
          />
          <CornerResizeHandles
            corners={corners}
            handleRefs={cornerRefs}
            titles={shapeCornerTitles("polygon")}
            onCornerMove={(corner, latlng, locked) => applyResize(corner, latlng, locked, false)}
            onCornerCommit={(corner, latlng, locked) => applyResize(corner, latlng, locked, true)}
          />
        </>
      )}
    </>
  );
};

export const EditableImage = ({
  obj,
  isSelected,
  interactive,
  onSelect,
  onUpdate,
  geometryEditMode,
}: EditableObjectProps) => {
  const image = obj as MapImage;
  const map = useMap();
  const { bounds } = image;

  // Live handles into Leaflet so a drag can move the overlay in real time.
  // The committed bounds only flow back through props on drag end.
  const overlayRef = useRef<Leaflet.ImageOverlay | null>(null);
  const centerHandleRef = useRef<Leaflet.Marker | null>(null);
  // Corner markers for the independent (vertex-mode) native drag.
  const cornerRefs = useRef<(Leaflet.Marker | null)[]>([]);
  // Corner markers for the aspect-locked (resize-mode) custom drag.
  const resizeCornerRefs = useRef<(Leaflet.Marker | null)[]>([]);

  // Derive the handle positions from the committed bounds. They are memoised on
  // the coordinate values so react-leaflet does not snap the handles back to
  // the committed bounds while a drag is in progress.
  const { lat: swLat, lng: swLng } = bounds.southWest;
  const { lat: neLat, lng: neLng } = bounds.northEast;
  const { center, cornerPositions, overlayBounds } = useMemo(() => {
    const current: MapImageBounds = {
      southWest: { lat: swLat, lng: swLng },
      northEast: { lat: neLat, lng: neLng },
    };
    const corners = getImageCornerPositions(current);
    return {
      center: getImageCenter(current),
      cornerPositions: corners,
      overlayBounds: [
        [swLat, swLng],
        [neLat, neLng],
      ] as LatLngTuple[],
    };
  }, [swLat, swLng, neLat, neLng]);

  /** Moves the overlay and its handles to the given bounds. */
  const applyLiveBounds = (
    next: MapImageBounds,
    options: { skipCorner?: ImageCorner; skipCenter?: boolean } = {},
  ) => {
    overlayRef.current?.setBounds(
      new Leaflet.LatLngBounds(next.southWest, next.northEast),
    );

    const nextCorners = getImageCornerPositions(next);
    IMAGE_CORNERS.forEach((corner, index) => {
      // The handle the user is dragging is already under the cursor.
      if (corner === options.skipCorner) return;
      cornerRefs.current[index]?.setLatLng(nextCorners[corner]);
      resizeCornerRefs.current[index]?.setLatLng(nextCorners[corner]);
    });

    if (!options.skipCenter) {
      centerHandleRef.current?.setLatLng(getImageCenter(next));
    }
  };

  const onMoveDrag = (e: DragEvent) => {
    const newPos = e.target.getLatLng();
    const delta: LatLngLiteral = {
      lat: newPos.lat - center.lat,
      lng: newPos.lng - center.lng,
    };
    applyLiveBounds(translateImageBounds(bounds, delta), { skipCenter: true });
  };

  const onMoveDragEnd = (e: DragEvent) => {
    const newPos = e.target.getLatLng();
    const delta: LatLngLiteral = {
      lat: newPos.lat - center.lat,
      lng: newPos.lng - center.lng,
    };
    onUpdate(image.id, { bounds: translateImageBounds(bounds, delta) });
  };

  const onCornerDrag =
    (corner: ImageCorner) =>
    (e: DragEvent) => {
      applyLiveBounds(resizeImageBounds(bounds, corner, e.target.getLatLng()), {
        skipCorner: corner,
      });
    };

  const onCornerDragEnd =
    (corner: ImageCorner) =>
    (e: DragEvent) => {
      onUpdate(image.id, {
        bounds: resizeImageBounds(bounds, corner, e.target.getLatLng()),
      });
    };

  // Resize mode: aspect-locked custom-drag corner handles.
  const applyResize = (
    corner: ImageCorner,
    latlng: LatLngLiteral,
    aspectLocked: boolean,
    commit: boolean,
  ): CornerPositions => {
    const next = resizeLatLngBounds(toResizeMap(map), bounds, corner, latlng, aspectLocked);
    overlayRef.current?.setBounds(
      new Leaflet.LatLngBounds(next.southWest, next.northEast),
    );
    centerHandleRef.current?.setLatLng(getImageCenter(next));
    const nextCorners = getImageCornerPositions(next);
    if (commit) onUpdate(image.id, { bounds: next });
    return nextCorners;
  };

  return (
    <>
      <ImageOverlay
        ref={overlayRef}
        bounds={overlayBounds}
        url={image.imageUrl}
        alt={image.title || 'Map image'}
        opacity={1}
        interactive={interactive}
        // Don't let object clicks bubble to the map: the map click handler
        // clears the selection, which would immediately undo the selection
        // this click just set.
        bubblingMouseEvents={false}
        eventHandlers={{
          click: () => {
            if (interactive) onSelect(image.id);
          },
        }}
      />
      {isSelected && (
        <>
          <Marker
            ref={centerHandleRef}
            position={center}
            icon={createMoveHandleIcon()}
            draggable={true}
            bubblingMouseEvents={false}
            title="Move image overlay"
            eventHandlers={{
              drag: onMoveDrag,
              dragend: (e) => {
                suppressTrailingClick();
                onMoveDragEnd(e);
              },
            }}
          />
          {geometryEditMode === "resize" ? (
            <CornerResizeHandles
              corners={cornerPositions}
              handleRefs={resizeCornerRefs}
              titles={IMAGE_CORNER_TITLES}
              onCornerMove={(corner, latlng, locked) => applyResize(corner, latlng, locked, false)}
              onCornerCommit={(corner, latlng, locked) => applyResize(corner, latlng, locked, true)}
            />
          ) : (
            IMAGE_CORNERS.map((corner, index) => (
              <Marker
                key={corner}
                ref={(marker) => {
                  cornerRefs.current[index] = marker;
                }}
                position={cornerPositions[corner]}
                // Vertex mode moves a corner freely, unlike the
                // direction-locked resize handles.
                icon={createVertexIcon('move')}
                draggable={true}
                bubblingMouseEvents={false}
                title={IMAGE_CORNER_TITLES[corner]}
                eventHandlers={{
                  drag: onCornerDrag(corner),
                  dragend: (e) => {
                    suppressTrailingClick();
                    onCornerDragEnd(corner)(e);
                  },
                }}
              />
            ))
          )}
        </>
      )}
    </>
  );
};
