import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  Marker,
  Circle,
  Polyline,
  Polygon,
  SVGOverlay,
  useMap,
} from "react-leaflet";
import Leaflet from "leaflet";
import type { LatLngLiteral, LeafletMouseEvent } from "leaflet";
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
  translateImageBounds,
  type ImageCorner,
} from "../utils/imageOverlay";
import {
  cornerPoint,
  metersToPixels,
  resizeCircle,
  resizeLatLngVertices,
  type Proj,
  type ResizeMap,
} from "../utils/geometryResize";
import {
  FRAME_CORNER_RING,
  formatRotation,
  getProjectedFrame,
  getRotatedCornerLatLngs,
  getRotatedOverlayGeometry,
  isNearFrameCorner,
  isWithinRotationBand,
  resizeRotatedImageBounds,
  rotationFromPointer,
  snapRotation,
  type RotatedOverlayGeometry,
} from "../utils/imageRotation";
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

  // The last seen pointer state, so a drag that ends without a mouseup can
  // still commit where it was last seen.
  let lastLatLng = map.mouseEventToLatLng(domEvent);
  let lastShift = false;
  // A mouseup and a blur can both reach one drag; finish it exactly once.
  let ended = false;

  const finish = (latlng: LatLngLiteral, shift: boolean) => {
    if (ended) return;
    ended = true;
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("mouseup", handleUp);
    document.removeEventListener("mouseleave", onAbandon);
    window.removeEventListener("blur", onAbandon);
    map.dragging?.enable?.();
    onEnd(latlng, shift);
    // The pointer is rarely back on the handle icon when the drag ends, so
    // the browser fires the trailing click on the map container and Leaflet's
    // own drag guard never sees the dragged layer. Eat that click so the map
    // handler does not clear the selection right after the gesture.
    suppressTrailingClick();
  };

  const handleMove = (ev: MouseEvent) => {
    lastLatLng = map.mouseEventToLatLng(ev);
    lastShift = ev.shiftKey;
    onMove(lastLatLng, lastShift);
  };
  const handleUp = (ev: MouseEvent) =>
    finish(map.mouseEventToLatLng(ev), ev.shiftKey);
  // Releasing outside the window fires no mouseup: finish on blur or the
  // pointer leaving the document, or the map would stay frozen with the
  // drag still armed (and leaks the trailing-click suppression).
  const onAbandon = () => finish(lastLatLng, lastShift);

  document.addEventListener("mousemove", handleMove);
  document.addEventListener("mouseup", handleUp);
  document.addEventListener("mouseleave", onAbandon);
  window.addEventListener("blur", onAbandon);
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

/** The SVG turn that places the drawn image into its rotated frame. */
const rotateTransform = (geometry: RotatedOverlayGeometry): string =>
  `rotate(${geometry.angleDeg} ${geometry.pivot.x} ${geometry.pivot.y})`;

/**
 * Paints a frame the component has not committed yet — a move, resize or
 * rotation preview. react-leaflet applies an overlay's `attributes` only when
 * it creates the element, so the user space and the image rect are written
 * directly while the gesture is live.
 */
const paintPreviewFrame = (
  overlayElement: Element | null | undefined,
  raster: SVGImageElement | null,
  geometry: RotatedOverlayGeometry,
): void => {
  overlayElement?.setAttribute("viewBox", geometry.viewBox);
  if (!raster) return;
  raster.setAttribute("x", String(geometry.image.x));
  raster.setAttribute("y", String(geometry.image.y));
  raster.setAttribute("width", String(geometry.image.width));
  raster.setAttribute("height", String(geometry.image.height));
  raster.setAttribute("transform", rotateTransform(geometry));
};

/**
 * Cursor shown over the area just outside a selected image's frame, where a
 * rotation drag begins: circular arrows, so rotatability is discoverable
 * before the first drag. Written to the map container like `MapBoard`'s
 * drawing cursor; clearing it restores Leaflet's own cursor.
 */
export const ROTATION_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E") 12 12, grab`;

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
  const resizeMap = useMemo(() => toResizeMap(map), [map]);
  const { bounds } = image;

  /** The angle the rotation gesture is previewing; null when idle. */
  const [previewRotation, setPreviewRotation] = useState<number | null>(null);
  const rotation = previewRotation ?? image.rotation ?? 0;

  // Live handles into Leaflet so a drag can move the overlay in real time.
  // The committed bounds only flow back through props on drag end.
  const overlayRef = useRef<Leaflet.SVGOverlay | null>(null);
  const rasterRef = useRef<SVGImageElement | null>(null);
  const frameRef = useRef<Leaflet.Polygon | null>(null);
  const centerHandleRef = useRef<Leaflet.Marker | null>(null);
  // Corner markers for the independent (vertex-mode) native drag.
  const cornerRefs = useRef<(Leaflet.Marker | null)[]>([]);
  // Corner markers for the aspect-locked (resize-mode) custom drag.
  const resizeCornerRefs = useRef<(Leaflet.Marker | null)[]>([]);
  // Mirrors the preview angle for the release handler, which commits without
  // waiting for another render.
  const previewRef = useRef<number | null>(null);
  // Tears down a gesture the component never got to finish, because a
  // re-render replaces the press handler while the pointer is still down.
  const endGestureRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endGestureRef.current?.(), []);

  // Derive the frame from the committed bounds. They are memoised on the
  // coordinate values so react-leaflet does not snap the handles back to the
  // committed bounds while a drag is in progress.
  const { lat: swLat, lng: swLng } = bounds.southWest;
  const { lat: neLat, lng: neLng } = bounds.northEast;

  // Rotation is stored as an angle but drawn in the projected plane, so the
  // corners are re-derived whenever the view changes.
  const [viewVersion, setViewVersion] = useState(0);
  useEffect(() => {
    const reproject = () => setViewVersion((version) => version + 1);
    map.on("zoomend moveend", reproject);
    return () => {
      map.off("zoomend moveend", reproject);
    };
  }, [map]);

  const { center, corners, frame, overlay } = useMemo(() => {
    const current: MapImageBounds = {
      southWest: { lat: swLat, lng: swLng },
      northEast: { lat: neLat, lng: neLng },
    };
    return {
      center: getImageCenter(current),
      corners: getRotatedCornerLatLngs(resizeMap, current, rotation),
      frame: getProjectedFrame(resizeMap, current, rotation),
      overlay: getRotatedOverlayGeometry(resizeMap, current, rotation),
    };
    // `viewVersion` is not read here: it is the bump from the pan/zoom
    // subscription above, because the projection the frame is derived from
    // changes under the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeMap, swLat, swLng, neLat, neLng, rotation, viewVersion]);

  const overlayBounds = useMemo(
    () =>
      new Leaflet.LatLngBounds(overlay.bounds.southWest, overlay.bounds.northEast),
    [overlay],
  );

  // The SVG's user space travels with the frame, and react-leaflet leaves
  // `attributes` alone once the element exists.
  useEffect(() => {
    overlayRef.current?.getElement()?.setAttribute("viewBox", overlay.viewBox);
  }, [overlay]);

  /** Moves the overlay, its frame and every handle onto the given bounds. */
  const applyLiveBounds = (
    next: MapImageBounds,
    options: { skipCorner?: ImageCorner; skipCenter?: boolean } = {},
  ) => {
    const geometry = getRotatedOverlayGeometry(resizeMap, next, rotation);
    overlayRef.current?.setBounds(
      new Leaflet.LatLngBounds(geometry.bounds.southWest, geometry.bounds.northEast),
    );
    paintPreviewFrame(overlayRef.current?.getElement(), rasterRef.current, geometry);

    const nextCorners = getRotatedCornerLatLngs(resizeMap, next, rotation);
    frameRef.current?.setLatLngs(FRAME_CORNER_RING.map((corner) => nextCorners[corner]));
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

  // Vertex mode: a corner moves independently, along the frame's own axes.
  const onCornerDrag =
    (corner: ImageCorner) =>
    (e: DragEvent) => {
      applyLiveBounds(
        resizeRotatedImageBounds(resizeMap, bounds, rotation, corner, e.target.getLatLng(), false),
        { skipCorner: corner },
      );
    };

  const onCornerDragEnd =
    (corner: ImageCorner) =>
    (e: DragEvent) => {
      onUpdate(image.id, {
        bounds: resizeRotatedImageBounds(
          resizeMap,
          bounds,
          rotation,
          corner,
          e.target.getLatLng(),
          false,
        ),
      });
    };

  // Resize mode: aspect-locked custom-drag corner handles.
  const applyResize = (
    corner: ImageCorner,
    latlng: LatLngLiteral,
    aspectLocked: boolean,
    commit: boolean,
  ): CornerPositions => {
    const next = resizeRotatedImageBounds(resizeMap, bounds, rotation, corner, latlng, aspectLocked);
    applyLiveBounds(next);
    if (commit) onUpdate(image.id, { bounds: next });
    return getRotatedCornerLatLngs(resizeMap, next, rotation);
  };

  // Hand the map cursor back when this image stops being the selected,
  // rotatable one (deselect, drawing mode, unmount). Keyed on selection and
  // interactivity only: the gesture effect below re-subscribes whenever the
  // previewing frame changes, and a cleanup that ran there would clear the
  // cursor mid-drag. `map` is deliberately omitted — only the container
  // node matters, and it is stable across renders.
  /* eslint-disable react-hooks/exhaustive-deps -- `map.getContainer()` is a
     stable node; only the selection/interactivity transition matters. */
  useEffect(() => () => {
    map.getContainer().style.cursor = "";
  }, [isSelected, interactive]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /**
   * Rotation gesture: pressing just outside the selected frame turns the image
   * about its centre. The angle is previewed live and only persisted when the
   * pointer is released after an actual drag, so a plain click in the band
   * still reaches the map and clears the selection as it always did.
   *
   * Hovering the band shows a rotation cursor so the affordance is
   * discoverable before the first drag; the map's own cursor resumes
   * everywhere else.
   */
  useEffect(() => {
    if (!isSelected || !interactive) return;

    const container = map.getContainer();
    // Clearing the inline cursor hands the pointer back to Leaflet's own
    // grab cursor, the same way `MapBoard`'s drawing cursor is cleared.
    const showRotationCursor = (show: boolean) => {
      container.style.cursor = show ? ROTATION_CURSOR : "";
    };

    // The grab zone is the band outside the frame, minus the keep-out around
    // each corner where a press belongs to the resize handle. Hover inside
    // the frame, beyond the band, or in the corner zone keeps the map's
    // own cursor.
    const inRotationGrabZone = (point: Proj) =>
      isWithinRotationBand(point, frame) &&
      !isNearFrameCorner(point, frame.corners);

    const trackRotationHover = (domEvent: MouseEvent) => {
      const point = map.project(map.mouseEventToLatLng(domEvent), map.getZoom());
      showRotationCursor(inRotationGrabZone(point));
    };
    const clearRotationHover = () => showRotationCursor(false);

    const beginRotation = (domEvent: MouseEvent) => {
      if (domEvent.button !== 0) return;
      const startPoint = map.project(map.mouseEventToLatLng(domEvent), map.getZoom());
      if (!inRotationGrabZone(startPoint)) return;

      Leaflet.DomEvent.stop(domEvent);
      // Keep the viewport still for the whole gesture.
      map.dragging?.disable?.();
      // The band travels with the previewing frame during the drag, so hold
      // the rotation cursor from press to release rather than letting hover
      // tracking move it off the moving band.
      showRotationCursor(true);

      const pivot = frame.center;
      const startAngle = rotation;
      let dragged = false;
      // A mouseup and a blur can both reach one gesture (release outside
      // the window, then alt-tab back); end it exactly once.
      let ended = false;

      const onMove = (ev: MouseEvent) => {
        const point = map.project(map.mouseEventToLatLng(ev), map.getZoom());
        const turned = snapRotation(
          rotationFromPointer(pivot, startPoint, point, startAngle),
          ev.shiftKey,
        );
        dragged = true;
        previewRef.current = turned;
        setPreviewRotation(turned);
      };

      // Releasing commits the turn; the unmount teardown only abandons it, so
      // an interrupted gesture never leaves listeners behind on the document.
      const endGesture = (commit: boolean) => {
        if (ended) return;
        ended = true;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("mouseleave", onAbandon);
        window.removeEventListener("blur", onAbandon);
        endGestureRef.current = null;
        map.dragging?.enable?.();
        // Hover tracking takes over again on the next pointer move.
        showRotationCursor(false);

        const finalAngle = previewRef.current;
        previewRef.current = null;
        setPreviewRotation(null);
        if (commit && dragged && finalAngle !== null) {
          onUpdate(image.id, { rotation: finalAngle });
          suppressTrailingClick();
        }
      };

      const onUp = () => endGesture(true);
      // Releasing outside the window fires no mouseup: end on blur or the
      // pointer leaving the document, or the drag stays armed and every
      // later pointer move would keep rotating the image.
      const onAbandon = () => endGesture(true);

      endGestureRef.current = () => endGesture(false);

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("mouseleave", onAbandon);
      window.addEventListener("blur", onAbandon);
    };

    container.addEventListener("mousedown", beginRotation);
    container.addEventListener("mousemove", trackRotationHover);
    container.addEventListener("mouseleave", clearRotationHover);
    return () => {
      container.removeEventListener("mousedown", beginRotation);
      container.removeEventListener("mousemove", trackRotationHover);
      container.removeEventListener("mouseleave", clearRotationHover);
    };
  }, [map, isSelected, interactive, frame, rotation, image.id, onUpdate]);

  return (
    <>
      <SVGOverlay
        ref={overlayRef}
        bounds={overlayBounds}
        attributes={{
          viewBox: overlay.viewBox,
          preserveAspectRatio: "none",
          role: "img",
          "aria-label": image.title || "Map image",
        }}
        opacity={image.opacity ?? 1}
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
      >
        <image
          ref={rasterRef}
          href={image.imageUrl}
          x={overlay.image.x}
          y={overlay.image.y}
          width={overlay.image.width}
          height={overlay.image.height}
          preserveAspectRatio="none"
          transform={rotateTransform(overlay)}
        />
      </SVGOverlay>
      {isSelected && (
        <>
          {/* The outline the handles and the rotation band are measured from. */}
          <Polygon
            ref={frameRef}
            positions={FRAME_CORNER_RING.map((corner) => corners[corner])}
            pathOptions={{ color: "#111827", weight: 1, dashArray: "4, 4", fill: false }}
            interactive={false}
            bubblingMouseEvents={false}
          />
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
              corners={corners}
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
                position={corners[corner]}
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
      {previewRotation !== null && (
        <div
          data-testid="rotation-readout"
          className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded bg-gray-900/90 px-2 py-1 text-xs font-medium text-white shadow-lg"
        >
          {formatRotation(previewRotation)}
        </div>
      )}
    </>
  );
};
