import React, { useState, useEffect } from "react";
import { Circle, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import type { LatLngLiteral, LeafletMouseEvent } from "leaflet";
import type {
  DrawingMode,
  MapCircle,
  MapPoint,
  MapPolygon,
  MapPolyline,
} from "../types";
import { calculateDistance, formatDistance, calculatePathLength } from "../utils/geoUtils";
import { createVertexIcon, createMoveHandleIcon } from "./Icons";
import { RulerMarkers } from "./RulerMarkers";

interface MapEventsProps {
  drawingMode: DrawingMode;
  setDrawingMode: (mode: DrawingMode) => void;
  activeLayerId: string;
  rulerPoints: LatLngLiteral[];
  setRulerPoints: React.Dispatch<React.SetStateAction<LatLngLiteral[]>>;
  setSelectedObjectId: (id: string | null) => void;
  onNewObject: (obj: MapPoint | MapCircle | MapPolyline | MapPolygon) => void;
}

const MapEvents = ({
  drawingMode,
  setDrawingMode,
  activeLayerId,
  rulerPoints,
  setRulerPoints,
  setSelectedObjectId,
  onNewObject,
}: MapEventsProps) => {
  const map = useMap();
  const [tempPoints, setTempPoints] = useState<LatLngLiteral[]>([]);
  const [circleCenter, setCircleCenter] = useState<LatLngLiteral | null>(null);
  const [dragPoint, setDragPoint] = useState<LatLngLiteral | null>(null);
  const [mouseHoverPoint, setMouseHoverPoint] = useState<LatLngLiteral | null>(
    null
  );

  // Escape key handler to cancel drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawingMode !== "none") {
        setDrawingMode("none");
        setTempPoints([]);
        setCircleCenter(null);
        setDragPoint(null);
        setRulerPoints([]);
        setMouseHoverPoint(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawingMode, setDrawingMode, setRulerPoints]);

  // Click Handler
  useEffect(() => {
    const handleClick = (e: LeafletMouseEvent) => {
      if (drawingMode === "none") {
        setSelectedObjectId(null);
        return;
      }

      const { lat, lng } = e.latlng;
      const point = { lat, lng };

      if (drawingMode === "point") {
        const newPoint: MapPoint = {
          id: crypto.randomUUID(),
          layerId: activeLayerId,
          type: "point",
          title: "New Point",
          description: "No description",
          position: point,
        };
        onNewObject(newPoint);
        setDrawingMode("none");
      } else if (drawingMode === "circle") {
        if (!circleCenter) {
          setCircleCenter(point);
          setDragPoint(point);
        } else {
          const radius = calculateDistance(
            circleCenter.lat,
            circleCenter.lng,
            point.lat,
            point.lng
          );
          if (radius > 0) {
            const newCircle: MapCircle = {
              id: crypto.randomUUID(),
              layerId: activeLayerId,
              type: "circle",
              title: "New Circle",
              description: "No description",
              center: circleCenter,
              radius: radius,
            };
            onNewObject(newCircle);
          }
          setCircleCenter(null);
          setDragPoint(null);
          setDrawingMode("none");
        }
      } else if (drawingMode === "polyline" || drawingMode === "polygon") {
        setTempPoints((prev) => [...prev, point]);
      } else if (drawingMode === "ruler") {
        setRulerPoints((prev) => [...prev, point]);
      }
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [
    map,
    drawingMode,
    circleCenter,
    activeLayerId,
    setDrawingMode,
    setSelectedObjectId,
    setRulerPoints,
    onNewObject,
  ]);

  // Mouse Move Handler (For Circle Preview & Line/Polygon/Ruler Hover Preview)
  useEffect(() => {
    const handleMouseMove = (e: LeafletMouseEvent) => {
      if (drawingMode === "circle" && circleCenter) {
        setDragPoint(e.latlng);
      } else if (
        (drawingMode === "polyline" ||
          drawingMode === "polygon" ||
          drawingMode === "ruler") &&
        (drawingMode === "ruler" ? rulerPoints.length : tempPoints.length) > 0
      ) {
        setMouseHoverPoint(e.latlng);
      }
    };

    map.on("mousemove", handleMouseMove);
    return () => {
      map.off("mousemove", handleMouseMove);
    };
  }, [map, drawingMode, circleCenter, tempPoints.length, rulerPoints.length]);

  // Double Click Handler
  useEffect(() => {
    const handleDblClick = () => {
      // Leaflet fires a 'click' for each press of a double click BEFORE the
      // 'dblclick' event, which would add a phantom vertex at the finish
      // position. Drop that trailing duplicate point here.
      const dropTrailingDuplicate = (points: LatLngLiteral[]) => {
        const last = points.at(-1);
        const prev = points.at(-2);
        if (
          last &&
          prev &&
          calculateDistance(last.lat, last.lng, prev.lat, prev.lng) < 1
        ) {
          return points.slice(0, -1);
        }
        return points;
      };

      if (drawingMode === "polyline") {
        const finalPoints = dropTrailingDuplicate(tempPoints);
        if (finalPoints.length > 1) {
          const newPolyline: MapPolyline = {
            id: crypto.randomUUID(),
            layerId: activeLayerId,
            type: "polyline",
            title: "New Line",
            description: "No description",
            positions: finalPoints,
          };
          onNewObject(newPolyline);
        }
        setTempPoints([]);
        setDrawingMode("none");
      } else if (drawingMode === "polygon") {
        const finalPoints = dropTrailingDuplicate(tempPoints);
        if (finalPoints.length > 2) {
          const newPolygon: MapPolygon = {
            id: crypto.randomUUID(),
            layerId: activeLayerId,
            type: "polygon",
            title: "New Polygon",
            description: "No description",
            positions: finalPoints,
          };
          onNewObject(newPolygon);
        }
        setTempPoints([]);
        setDrawingMode("none");
      } else if (drawingMode === "ruler") {
        // Keep the measured points so the finished trace with its distance
        // labels stays visible on the map; only exit ruler mode.
        setDrawingMode("none");
      }
      setMouseHoverPoint(null);
    };

    map.on("dblclick", handleDblClick);
    return () => {
      map.off("dblclick", handleDblClick);
    };
  }, [
    map,
    drawingMode,
    tempPoints,
    activeLayerId,
    setDrawingMode,
    setRulerPoints,
    onNewObject,
  ]);

  const activePoints = drawingMode === "ruler" ? rulerPoints : tempPoints;

  return (
    <>
      {/* Drawing Circle Preview */}
      {drawingMode === "circle" &&
        circleCenter &&
        dragPoint &&
        (() => {
          const radius = calculateDistance(
            circleCenter.lat,
            circleCenter.lng,
            dragPoint.lat,
            dragPoint.lng
          );
          return (
            <>
              <Circle
                center={circleCenter}
                radius={radius}
                pathOptions={{
                  color: "blue",
                  dashArray: "5, 5",
                  opacity: 0.6,
                }}
                interactive={false}
              />
              <Polyline
                positions={[circleCenter, dragPoint]}
                pathOptions={{
                  color: "blue",
                  dashArray: "5, 5",
                  weight: 1,
                  opacity: 0.5,
                }}
                interactive={false}
              />
              <Marker
                position={dragPoint}
                icon={createVertexIcon()}
                opacity={0}
                interactive={false}
              >
                <Tooltip permanent direction="right" offset={[10, 0]}>
                  Radius: {formatDistance(radius)}
                </Tooltip>
              </Marker>
            </>
          );
        })()}

      {/* Drawing Polyline/Polygon/Ruler Preview */}
      {(drawingMode === "polyline" ||
        drawingMode === "polygon" ||
        drawingMode === "ruler") &&
        activePoints.length > 0 && (
          <>
            {drawingMode === "ruler" ? (
              // Ruler vertices carry permanent cumulative distance labels.
              <RulerMarkers points={activePoints} />
            ) : (
              activePoints.map((p, i) => (
                <Marker
                  key={`${p.lat}-${p.lng}-${i}`}
                  position={p}
                  icon={createVertexIcon()}
                />
              ))
            )}
            <Polyline
              positions={
                mouseHoverPoint
                  ? [...activePoints, mouseHoverPoint]
                  : activePoints
              }
              pathOptions={{
                color: drawingMode === "ruler" ? "black" : "blue",
                dashArray: "5, 5",
              }}
              interactive={false}
            />
            {/* Live running total that follows the cursor while measuring */}
            {drawingMode === "ruler" && mouseHoverPoint && (
              <Marker
                position={mouseHoverPoint}
                icon={createMoveHandleIcon()}
                interactive={false}
                opacity={0}
              >
                <Tooltip permanent direction="right" offset={[12, 0]}>
                  {formatDistance(
                    calculatePathLength([...activePoints, mouseHoverPoint])
                  )}
                </Tooltip>
              </Marker>
            )}
          </>
        )}
    </>
  );
};

/**
 * Wraps MapEvents so that its internal temp-drawing state is discarded
 * whenever the drawing mode changes — replacing the previous "reset state in
 * an effect" pattern with a keyed remount.
 */
const MapEventsContainer = (props: MapEventsProps) => (
  <MapEvents key={props.drawingMode} {...props} />
);

export default MapEventsContainer;
