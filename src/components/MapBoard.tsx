import React, { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  useMap,
} from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import type * as L from "leaflet";
import type {
  DrawingMode,
  GeometryEditMode,
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
  EditableImage,
} from "./MapBoardEditable";
import MapEventsContainer from "./MapBoardEvents";
import { RulerMarkers } from "./RulerMarkers";

// --- Internal Components ---

/**
 * Moves the viewport onto the focused object. Only the centre changes: the
 * current zoom level is preserved, so focusing never rescales the map.
 */
const FocusController = ({
  focusTarget,
  objects,
}: {
  focusTarget: { id: string; token: number } | null | undefined;
  objects: MapObject[];
}) => {
  const map = useMap();
  const lastFocusTokenRef = useRef<number>(0);

  useEffect(() => {
    // Only focus on a new request (the token is strictly increasing).
    if (focusTarget && focusTarget.token > lastFocusTokenRef.current) {
      const obj = objects.find((o) => o.id === focusTarget.id);
      if (obj) {
        const center = getObjectCenter(obj);
        // panTo re-centres without touching the zoom; flyTo/setView would
        // change the zoom level.
        map.panTo(center, { animate: true, duration: 1.5 });
        lastFocusTokenRef.current = focusTarget.token;
      }
    }
  }, [focusTarget, objects, map]);

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

/** Notifies the parent once when the map instance is ready. */
const MapReadyHandler = ({
  onMapReady,
}: {
  onMapReady?: (map: L.Map) => void;
}) => {
  const map = useMap();
  useEffect(() => {
    if (onMapReady) onMapReady(map);
  }, [map, onMapReady]);
  return null;
};

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
  /** Selection-scoped geometry editing mode for images, lines and polygons. */
  geometryEditMode: GeometryEditMode;
  rulerPoints: LatLngLiteral[];
  setRulerPoints: React.Dispatch<React.SetStateAction<LatLngLiteral[]>>;
  /** Object to focus: the map pans onto it, keeping the current zoom. */
  focusTarget?: { id: string; token: number } | null;
  onObjectUpdate?: (updatedObject: MapObject) => void;
  onNewObject?: (obj: MapObject) => void;
  /** Called once with the live Leaflet map after it mounts. */
  onMapReady?: (map: L.Map) => void;
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
  geometryEditMode,
  rulerPoints,
  setRulerPoints,
  focusTarget,
  onObjectUpdate,
  onNewObject,
  onMapReady,
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
        maxZoom={21}
        style={{ height: "100%", width: "100%" }}
        doubleClickZoom={false}
      >
        <CursorController cursor={cursor} />
        <MapReadyHandler onMapReady={onMapReady} />

        <TileLayer
          attribution='&copy; <a href="https://www.google.com/">Google</a> contributors'
          url="https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
          maxZoom={21}
          subdomains={["mt0", "mt1", "mt2", "mt3"]}
        />

        <FocusController focusTarget={focusTarget} objects={objects} />

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
            geometryEditMode,
            // Clicking an object on the map only selects it. The viewport is
            // left where the user put it.
            onSelect: setSelectedObjectId,
            onUpdate: handleObjectUpdate,
          };

          if (obj.type === "point") return <EditablePoint {...props} />;
          if (obj.type === "circle") return <EditableCircle {...props} />;
          if (obj.type === "polyline") return <EditablePolyline {...props} />;
          if (obj.type === "polygon") return <EditablePolygon {...props} />;
          if (obj.type === "image") return <EditableImage {...props} />;
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
