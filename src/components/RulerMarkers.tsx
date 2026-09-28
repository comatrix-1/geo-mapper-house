import { Marker, Tooltip } from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import { calculatePathLength, formatDistance } from "../utils/geoUtils";
import { createVertexIcon } from "./Icons";

interface RulerMarkersProps {
  points: LatLngLiteral[];
  /**
   * When true, the last marker's label reads "Total: …" instead of the bare
   * cumulative distance. Used for the finished ruler trace.
   */
  showTotal?: boolean;
}

/**
 * Ruler vertex markers with permanent labels. Each marker shows the cumulative
 * distance from the first point; with showTotal the final marker is labelled
 * as the total. Markers are non-interactive so clicks pass through to the map.
 */
export const RulerMarkers = ({ points, showTotal = false }: RulerMarkersProps) => (
  <>
    {points.map((p, i) => {
      const cumulative = calculatePathLength(points.slice(0, i + 1));
      const isLast = i === points.length - 1;
      const label =
        showTotal && isLast
          ? `Total: ${formatDistance(cumulative)}`
          : formatDistance(cumulative);
      return (
        <Marker
          key={`r-${p.lat}-${p.lng}-${i}`}
          position={p}
          icon={createVertexIcon()}
          interactive={false}
        >
          <Tooltip permanent direction="right" offset={[8, 0]}>
            {label}
          </Tooltip>
        </Marker>
      );
    })}
  </>
);
