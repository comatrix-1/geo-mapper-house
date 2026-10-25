import { useState } from "react"
import type {
  GeometryEditMode,
  MapCircle,
  MapObject,
  MapPoint,
  MapPolygon,
  MapPolyline,
} from "../types"
import {
  calculatePathLength,
  calculatePolygonArea,
  formatDistance,
  formatArea,
} from "../utils/geoUtils"
import { Save, Trash2, Check, Ruler } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ObjectDetailsPanelProps {
  obj: MapObject
  /** Selection-scoped geometry editing mode, shown for images, lines and polygons. */
  geometryEditMode: GeometryEditMode
  onGeometryEditModeChange: (mode: GeometryEditMode) => void
  /** Patch the object; merged with the existing object and persisted by the parent. */
  onUpdate: (id: string, updates: Partial<MapObject>) => void
  onDelete: (id: string) => void
}

/** Object types that can switch between four-handle resize and vertex editing. */
const GEOMETRY_MODE_TYPES: ReadonlySet<MapObject["type"]> = new Set([
  "image",
  "polyline",
  "polygon",
])

/**
 * Accessible resize / vertex choice shown above the object details. Native
 * radios give grouping, labelling and arrow-key navigation for free, so no
 * extra keyboard handling is needed.
 */
const GeometryEditModeChoice = ({
  value,
  onChange,
}: {
  value: GeometryEditMode
  onChange: (mode: GeometryEditMode) => void
}) => (
  <div className="space-y-1.5" role="radiogroup" aria-label="Geometry editing">
    <span className="block text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider mb-1">
      Geometry editing
    </span>
    <div className="flex gap-2">
      {(
        [
          { mode: "resize", label: "Resize" },
          { mode: "vertices", label: "Edit vertices" },
        ] as const
      ).map(({ mode, label }) => (
        <label
          key={mode}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs rounded-md border border-sidebar-border px-2 py-1.5 cursor-pointer has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:border-primary"
        >
          <input
            type="radio"
            name="geometry-edit-mode"
            value={mode}
            checked={value === mode}
            onChange={() => onChange(mode)}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </div>
  </div>
)

/** Per-type geometry details + type-specific edit controls. */
const ObjectDetails = ({ obj }: { obj: MapObject }) => {
  switch (obj.type) {
    case "point": {
      const point = obj as MapPoint
      return (
        <div className="text-xs text-sidebar-foreground/70 font-mono bg-sidebar-accent/50 p-2 rounded border border-sidebar-border">
          <div className="flex items-center justify-between">
            <span>Lat:</span>
            <span className="text-sidebar-foreground">{point.position.lat.toFixed(6)}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span>Lng:</span>
            <span className="text-sidebar-foreground">{point.position.lng.toFixed(6)}</span>
          </div>
        </div>
      )
    }
    case "circle": {
      const circle = obj as MapCircle
      const area = Math.PI * Math.pow(circle.radius, 2)
      return (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-sidebar-foreground/60">Area:</span>
            <span className="font-medium text-primary">{formatArea(area)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sidebar-foreground/60">Radius:</span>
            <span className="font-medium text-primary">
              {formatDistance(circle.radius)}
            </span>
          </div>
          <div className="text-xs text-sidebar-foreground/50 font-mono">
            Center: {circle.center.lat.toFixed(5)}, {circle.center.lng.toFixed(5)}
          </div>
        </div>
      )
    }
    case "polyline": {
      const polyline = obj as MapPolyline
      const distance = calculatePathLength(polyline.positions)
      return (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-sidebar-foreground/60">Distance:</span>
            <span className="font-medium text-primary">{formatDistance(distance)}</span>
          </div>
        </div>
      )
    }
    case "polygon": {
      const polygon = obj as MapPolygon
      const area = calculatePolygonArea(polygon.positions)
      return (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-sidebar-foreground/60">Area:</span>
            <span className="font-medium text-primary">{formatArea(area)}</span>
          </div>
        </div>
      )
    }
  }
}

/** Type-specific edit controls (nothing to edit inline for lines/polygons). */
const ObjectEditExtras = ({
  obj,
  onUpdate,
}: {
  obj: MapObject
  onUpdate: ObjectDetailsPanelProps["onUpdate"]
}) => {
  // The radius field is a free-text input: keeping the raw string lets the
  // user clear it or type a decimal (rounding into `value` would turn
  // "100.5" into "1005" mid-keystroke and make the field un-clearable).
  // The parsed number is committed upward; unparseable input stays local
  // until the next valid value.
  const committedRadius =
    obj.type === "circle" ? (obj as MapCircle).radius : null
  const [radiusText, setRadiusText] = useState(
    committedRadius == null ? "" : String(committedRadius)
  )
  const [prevRadius, setPrevRadius] = useState(committedRadius)
  if (committedRadius !== prevRadius) {
    // External change (map drag, panel remount): drop in-progress text.
    setPrevRadius(committedRadius)
    setRadiusText(committedRadius == null ? "" : String(committedRadius))
  }

  switch (obj.type) {
    case "point":
      return (
        <div className="text-xs text-sidebar-foreground/70 italic">
          Coordinates can be changed by dragging the pin.
        </div>
      )
    case "circle": {
      const circle = obj as MapCircle
      return (
        <div className="space-y-1.5">
          <label
            htmlFor="circle-radius-input"
            className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider"
          >
            Radius (m)
          </label>
          <Input
            id="circle-radius-input"
            type="number"
            min="1"
            className="h-8"
            value={radiusText}
            onChange={(e) => {
              const text = e.target.value
              setRadiusText(text)
              const val = Number.parseFloat(text)
              if (!Number.isNaN(val) && val > 0) {
                onUpdate(circle.id, { radius: val })
              }
            }}
          />
        </div>
      )
    }
    case "polyline":
    case "polygon":
      return (
        <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/50">
          <Ruler size={12} className="shrink-0" />
          <span>Drag vertices to reshape.</span>
        </div>
      )
  }
}

const ObjectDetailsPanel = ({
  obj,
  geometryEditMode,
  onGeometryEditModeChange,
  onUpdate,
  onDelete,
}: ObjectDetailsPanelProps) => {
  // Fields are editable by default and every change patches the object
  // optimistically (the parent persists live), so there is no separate edit
  // mode. The Save button acknowledges that state with brief feedback.
  const [justSaved, setJustSaved] = useState(false)

  const handleSave = () => {
    setJustSaved(true)
    window.setTimeout(() => setJustSaved(false), 1500)
  }

  return (
    <div className="flex flex-col gap-2.5">
      {GEOMETRY_MODE_TYPES.has(obj.type) && (
        <GeometryEditModeChoice
          value={geometryEditMode}
          onChange={onGeometryEditModeChange}
        />
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="object-title-input"
          className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider"
        >
          Title
        </label>
        <Input
          id="object-title-input"
          className="h-8"
          value={obj.title ?? ""}
          onChange={(e) => onUpdate(obj.id, { title: e.target.value })}
          placeholder="Title"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="object-description-input"
          className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider"
        >
          Description
        </label>
        <textarea
          id="object-description-input"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
          rows={3}
          value={obj.description ?? ""}
          onChange={(e) => onUpdate(obj.id, { description: e.target.value })}
          placeholder="Description"
        />
      </div>

      <ObjectDetails obj={obj} />

      <ObjectEditExtras obj={obj} onUpdate={onUpdate} />

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(obj.id)}
          title="Delete Object"
          aria-label="Delete Object"
          className="text-sidebar-foreground/50 hover:text-destructive"
        >
          <Trash2 size={16} />
        </Button>

        <Button size="sm" onClick={handleSave}>
          {justSaved ? <Check size={14} /> : <Save size={14} />}
          <span className="ml-2">{justSaved ? "Saved" : "Save"}</span>
        </Button>
      </div>
    </div>
  )
}

export default ObjectDetailsPanel
