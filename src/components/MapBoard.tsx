import React, { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  useMap,
} from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import type {
  DrawingMode,
  MapObject,
  Layer,
  LayerStyle,
} from "../types";
import { getObjectCenter } from "../utils/geoUtils";
import {
  EditablePoint,
  EditableCircle,
  EditablePolyline,
  EditablePolygon,
} from "./MapBoardEditable";
import MapEventsContainer from "./MapBoardEvents";
import { RulerMarkers } from "./RulerMarkers";

// --- Internal Components ---

const FlyToController = ({
  flyToTarget,
  objects,
}: {
  flyToTarget: { id: string; time: number } | null | undefined;
  objects: MapObject[];
}) => {
  const map = useMap();
  const lastFlyToTimeRef = useRef<number>(0);

  useEffect(() => {
    // Only fly if we have a target and it's a new request (timestamp is newer than last handled)
    if (flyToTarget && flyToTarget.time > lastFlyToTimeRef.current) {
      const obj = objects.find((o) => o.id === flyToTarget.id);
      if (obj) {
        const center = getObjectCenter(obj);
        map.flyTo(center, 16, { duration: 1.5 });
        lastFlyToTimeRef.current = flyToTarget.time;
      }
    }
  }, [flyToTarget, objects, map]);

  return null;
};

const CursorController = ({ cursor }: { cursor: string | null }) => {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();

    if (cursor === "crosshair") {
      container.classList.add("leaflet-crosshair");
      container.style.cursor = "";
    } else {
      container.classList.remove("leaflet-crosshair");
      // "" restores Leaflet's default grab cursor
      container.style.cursor = cursor ?? "";
    }

    return () => {
      container.classList.remove("leaflet-crosshair");
      container.style.cursor = "";
    };
  }, [cursor, map]);

  return null;
};

/** Persistent ruler trace shown after the ruler tool is closed. */
const RulerOverlay = ({ rulerPoints }: { rulerPoints: LatLngLiteral[] }) => (
  <>
    {rulerPoints.length > 1 && (
      <Polyline
        positions={rulerPoints}
        pathOptions={{ color: "black", dashArray: "10, 10", weight: 2 }}
        interactive={false}
      />
    )}
    <RulerMarkers points={rulerPoints} showTotal={rulerPoints.length > 1} />
  </>
);

// --- Helpers ---

const DEFAULT_STYLE: LayerStyle = {
  borderColor: "#3388ff",
  borderWidth: 2,
  fillColor: "#3388ff",
  fillOpacity: 0.2,
};

const getLayerStyle = (layers: Layer[], layerId: string): LayerStyle =>
  layers.find((l) => l.id === layerId)?.style ?? DEFAULT_STYLE;

const isLayerVisible = (layers: Layer[], layerId: string) =>
  layers.find((l) => l.id === layerId)?.visible ?? true;

// --- Main Component ---

interface MapBoardProps {
  layers: Layer[];
  activeLayerId: string;
  drawingMode: DrawingMode;
  setDrawingMode: (mode: DrawingMode) => void;
  objects: MapObject[];
  setObjects: React.Dispatch<React.SetStateAction<MapObject[]>>;
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  rulerPoints: LatLngLiteral[];
  setRulerPoints: React.Dispatch<React.SetStateAction<LatLngLiteral[]>>;
  flyToTarget?: { id: string; time: number } | null;
  onObjectUpdate?: (updatedObject: MapObject) => void;
  onObjectDelete?: (id: string) => void;
  onNewObject?: (obj: MapObject) => void;
}

const MapBoard: React.FC<MapBoardProps> = ({
  layers,
  activeLayerId,
  drawingMode,
  setDrawingMode,
  objects,
  setObjects,
  selectedObjectId,
  setSelectedObjectId,
  rulerPoints,
  setRulerPoints,
  flyToTarget,
  onObjectUpdate,
  onObjectDelete,
  onNewObject,
}) => {
  const cursor = drawingMode !== "none" ? "crosshair" : null;

  const handleObjectUpdate = (id: string, updates: Partial<MapObject>) => {
    const target = objects.find((o) => o.id === id);
    if (!target) return;

    const updatedObject = { ...target, ...updates } as MapObject;

    // Optimistic UI Update
    setObjects((prev) => prev.map((o) => (o.id === id ? updatedObject : o)));

    // Persist
    if (onObjectUpdate) onObjectUpdate(updatedObject);
  };

  const updateObjectMeta = (id: string, title: string, desc: string) => {
    handleObjectUpdate(id, { title, description: desc });
  };

  const deleteObject = (id: string) => {
    // Optimistic UI Update
    setObjects((prev) => prev.filter((o) => o.id !== id));
    if (selectedObjectId === id) {
      setSelectedObjectId(null);
    }
    // Persist
    if (onObjectDelete) onObjectDelete(id);
  };

  const handleNewObject = (obj: MapObject) => {
    // Optimistic UI Update
    setObjects((prev) => [...prev, obj]);
    // Persist
    if (onNewObject) onNewObject(obj);
  };

  return (
    <div className="w-full h-full z-0">
      <MapContainer
        center={[1.3360910507988213, 103.83350372314455]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        doubleClickZoom={false}
      >
        <CursorController cursor={cursor} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FlyToController flyToTarget={flyToTarget} objects={objects} />

        <MapEventsContainer
          drawingMode={drawingMode}
          setDrawingMode={setDrawingMode}
          activeLayerId={activeLayerId}
          rulerPoints={rulerPoints}
          setRulerPoints={setRulerPoints}
          setSelectedObjectId={setSelectedObjectId}
          onNewObject={handleNewObject}
        />

        {/* Render Objects */}
        {objects.map((obj) => {
          if (!isLayerVisible(layers, obj.layerId)) return null;

          const isSelected = selectedObjectId === obj.id;
          const style = getLayerStyle(layers, obj.layerId);

          // Interactive only when NOT in drawing mode.
          // The key forces a remount when interactivity changes (react-leaflet
          // does not reliably update `interactive` on an existing path).
          const isInteractive = drawingMode === "none";

          const props = {
            key: `${obj.id}-${isInteractive ? "interactive" : "static"}`,
            obj,
            style,
            isSelected,
            interactive: isInteractive,
            setSelectedObjectId,
            onUpdate: handleObjectUpdate,
            updateObjectMeta,
            onDelete: deleteObject,
          };

          if (obj.type === "point") return <EditablePoint {...props} />;
          if (obj.type === "circle") return <EditableCircle {...props} />;
          if (obj.type === "polyline") return <EditablePolyline {...props} />;
          if (obj.type === "polygon") return <EditablePolygon {...props} />;
          return null;
        })}

        {/* Ruler Overlay */}
        {rulerPoints.length > 0 && drawingMode !== "ruler" && (
          <RulerOverlay rulerPoints={rulerPoints} />
        )}
      </MapContainer>
    </div>
  );
};

export default MapBoard;
