import React, { useRef } from "react";
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
import {
  calculatePathLength,
  calculatePolygonArea,
  formatDistance,
  formatArea,
  getCentroid,
} from "../utils/geoUtils";
import {
  createMarkerIcon,
  createMoveHandleIcon,
  createVertexIcon,
} from "./Icons";
import { ObjectPopup, RadiusInput } from "./MapBoardPopups";

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
  updateObjectMeta: (id: string, title: string, desc: string) => void;
  onDelete: (id: string) => void;
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
  onVertexDrag: (idx: number, e: DragEvent) => void;
  onVertexDragEnd: (idx: number, e: DragEvent) => void;
  center: LatLngLiteral;
  onCenterDrag: (e: DragEvent) => void;
  onCenterDragEnd: (e: DragEvent) => void;
}

/** Vertex + move-handle markers shared by polyline and polygon editors. */
const ShapeHandles = ({
  positions,
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
        position={pos}
        icon={createVertexIcon()}
        draggable={true}
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
  updateObjectMeta,
  onDelete,
}: EditableObjectProps) => {
  const point = obj as MapPoint;
  return (
    <Marker
      position={point.position}
      // Use borderColor as the main color for the point marker
      icon={createMarkerIcon(style.borderColor)}
      draggable={isSelected}
      interactive={interactive}
      eventHandlers={{
        click: () => {
          if (interactive) setSelectedObjectId(point.id);
        },
        dragend: (e) => onUpdate(point.id, { position: e.target.getLatLng() }),
      }}
    >
      <ObjectPopup
        obj={point}
        updateObjectMeta={updateObjectMeta}
        onDelete={onDelete}
        renderExtraView={() => (
          <div className="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded border border-gray-100">
            <div>Lat: {point.position.lat.toFixed(6)}</div>
            <div>Lng: {point.position.lng.toFixed(6)}</div>
          </div>
        )}
        renderExtraEdit={() => (
          <div className="text-xs text-gray-400 italic">
            Coordinates can be changed by dragging the pin.
          </div>
        )}
      />
    </Marker>
  );
};

export const EditableCircle = ({
  obj,
  style,
  isSelected,
  interactive,
  setSelectedObjectId,
  onUpdate,
  updateObjectMeta,
  onDelete,
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

  const area = Math.PI * Math.pow(circle.radius, 2);

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
        eventHandlers={{
          click: () => {
            if (interactive) setSelectedObjectId(circle.id);
          },
        }}
      >
        <ObjectPopup
          obj={circle}
          updateObjectMeta={updateObjectMeta}
          onDelete={onDelete}
          renderExtraView={() => (
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Area:</span>
                <span className="font-medium text-blue-700">
                  {formatArea(area)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Radius:</span>
                <span className="font-medium text-blue-700">
                  {formatDistance(circle.radius)}
                </span>
              </div>
              <div className="text-xs text-gray-400 font-mono mt-1">
                Center: {circle.center.lat.toFixed(5)},{" "}
                {circle.center.lng.toFixed(5)}
              </div>
            </div>
          )}
          renderExtraEdit={() => (
            <RadiusInput
              value={circle.radius}
              onChange={(r) => onUpdate(circle.id, { radius: r })}
            />
          )}
        />
      </Circle>
      {isSelected && (
        <Marker
          position={circle.center}
          draggable={true}
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
  updateObjectMeta,
  onDelete,
}: EditableObjectProps) => {
  const polyline = obj as MapPolyline;
  const polylineRef = useRef<L.Polyline>(null);
  const center = getCentroid(polyline.positions);
  const distance = calculatePathLength(polyline.positions);
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
        eventHandlers={{
          click: () => {
            if (interactive) setSelectedObjectId(polyline.id);
          },
        }}
      >
        <ObjectPopup
          obj={polyline}
          updateObjectMeta={updateObjectMeta}
          onDelete={onDelete}
          renderExtraView={() => (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Distance:</span>
              <span className="font-medium text-blue-700">
                {formatDistance(distance)}
              </span>
            </div>
          )}
          renderExtraEdit={() => (
            <div className="text-xs text-gray-400 italic">
              {showVertices
                ? "Drag points on map to edit path."
                : "Shape is too complex to edit individual points."}
            </div>
          )}
        />
      </Polyline>
      {isSelected && showVertices && (
        <ShapeHandles
          positions={polyline.positions}
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
            dragShapeOn(polylineRef, polyline.positions, center, e)
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
  updateObjectMeta,
  onDelete,
}: EditableObjectProps) => {
  const polygon = obj as MapPolygon;
  const polygonRef = useRef<L.Polygon>(null);
  const center = getCentroid(polygon.positions);
  const area = calculatePolygonArea(polygon.positions);
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
        eventHandlers={{
          click: () => {
            if (interactive) setSelectedObjectId(polygon.id);
          },
        }}
      >
        <ObjectPopup
          obj={polygon}
          updateObjectMeta={updateObjectMeta}
          onDelete={onDelete}
          renderExtraView={() => (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Area:</span>
              <span className="font-medium text-blue-700">
                {formatArea(area)}
              </span>
            </div>
          )}
          renderExtraEdit={() => (
            <div className="text-xs text-gray-400 italic">
              {showVertices
                ? "Drag vertices on map to reshape."
                : "Shape is too complex to edit individual vertices."}
            </div>
          )}
        />
      </Polygon>
      {isSelected && showVertices && (
        <ShapeHandles
          positions={polygon.positions}
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
            dragShapeOn(polygonRef, polygon.positions, center, e)
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
