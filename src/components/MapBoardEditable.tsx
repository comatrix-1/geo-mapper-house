import { useRef } from "react";
import { Marker, Circle, Polyline, Polygon } from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import type {
  MapCircle,
  MapObject,
  MapPoint,
  MapPolygon,
  MapPolyline,
  LayerStyle,
} from "../types";
import { getCentroid } from "../utils/geoUtils";
import {
  createMarkerIcon,
  createMoveHandleIcon,
  createVertexIcon,
} from "./Icons";

// Limit vertices for showing edit handles to prevent crash on large imports (e.g. detailed country borders)
const VERTEX_LIMIT = 100;

export interface EditableObjectProps {
  obj: MapObject;
  style: LayerStyle;
  isSelected: boolean;
  /** True when the map is not in a drawing mode, i.e. objects are clickable. */
  interactive: boolean;
  setSelectedObjectId: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<MapObject>) => void;
}

type DragEvent = { target: { getLatLng: () => LatLngLiteral } };

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
  vertexRefs: { current: (L.Marker | null)[] },
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
  vertexRefs: { current: (L.Marker | null)[] };
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
}: VertexHandlesProps) => (
  <>
    {positions.map((pos, idx) => (
      <Marker
        key={`v-${pos.lat}-${pos.lng}-${idx}`}
        ref={(m) => {
          vertexRefs.current[idx] = m;
        }}
        position={pos}
        icon={createVertexIcon()}
        draggable={true}
        bubblingMouseEvents={false}
        eventHandlers={{
          drag: (e) => onVertexDrag(idx, e),
          dragend: (e) => onVertexDragEnd(idx, e),
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
        dragend: onCenterDragEnd,
      }}
    />
  </>
);

export const EditablePoint = ({
  obj,
  style,
  isSelected,
  interactive,
  setSelectedObjectId,
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
          if (interactive) setSelectedObjectId(point.id);
        },
        dragend: (e) => onUpdate(point.id, { position: e.target.getLatLng() }),
      }}
    />
  );
};

export const EditableCircle = ({
  obj,
  style,
  isSelected,
  interactive,
  setSelectedObjectId,
  onUpdate,
}: EditableObjectProps) => {
  const circle = obj as MapCircle;
  const circleRef = useRef<L.Circle>(null);

  const onHandleDrag = (e: DragEvent) => {
    const newPos = e.target.getLatLng();
    if (circleRef.current) {
      circleRef.current.setLatLng(newPos);
    }
  };

  const onHandleDragEnd = (e: DragEvent) => {
    onUpdate(circle.id, { center: e.target.getLatLng() });
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
            if (interactive) setSelectedObjectId(circle.id);
          },
        }}
      />
      {isSelected && (
        <Marker
          position={circle.center}
          draggable={true}
          bubblingMouseEvents={false}
          icon={createMoveHandleIcon()}
          eventHandlers={{
            drag: onHandleDrag,
            dragend: onHandleDragEnd,
          }}
        />
      )}
    </>
  );
};

export const EditablePolyline = ({
  obj,
  style,
  isSelected,
  interactive,
  setSelectedObjectId,
  onUpdate,
}: EditableObjectProps) => {
  const polyline = obj as MapPolyline;
  const polylineRef = useRef<L.Polyline>(null);
  const vertexRefs = useRef<(L.Marker | null)[]>([]);
  const center = getCentroid(polyline.positions);
  const showVertices = polyline.positions.length <= VERTEX_LIMIT;

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
            if (interactive) setSelectedObjectId(polyline.id);
          },
        }}
      />
      {isSelected && showVertices && (
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
    </>
  );
};

export const EditablePolygon = ({
  obj,
  style,
  isSelected,
  interactive,
  setSelectedObjectId,
  onUpdate,
}: EditableObjectProps) => {
  const polygon = obj as MapPolygon;
  const polygonRef = useRef<L.Polygon>(null);
  const vertexRefs = useRef<(L.Marker | null)[]>([]);
  const center = getCentroid(polygon.positions);
  const showVertices = polygon.positions.length <= VERTEX_LIMIT;

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
            if (interactive) setSelectedObjectId(polygon.id);
          },
        }}
      />
      {isSelected && showVertices && (
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
    </>
  );
};
