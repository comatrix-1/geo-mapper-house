import { useState, useRef, useCallback } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import type { Layer, LayerStyle, MapObject } from "../types";
import { toDragCommand } from "../utils/dragDropState";
import { SortableLayerRow, DraggableObjectItem } from "./LayerRow";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Layers,
  Plus,
  Upload,
  Settings,
  Palette,
  FolderOpen,
  Save,
  AlertTriangle,
  FileJson,
  X,
} from "lucide-react";
import { importFile } from "../utils/fileImporter";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import ObjectDetailsPanel from "./ObjectDetailsPanel";

interface LayerSidebarProps {
  layers: Layer[];
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  updateLayer: (layer: Layer) => void;
  /** Reorder layers after a drag-and-drop drop (dragged layer takes the
   * target row's position). */
  reorderLayer: (draggedId: string, targetId: string) => void;
  /** Move an object to another layer after a drag-and-drop drop. An optional
   * index places it within the target layer's display order. */
  onObjectLayerChange: (
    objectId: string,
    targetLayerId: string,
    targetIndex?: number,
  ) => void;
  /** Reorder an object within its own layer after a drag-and-drop drop. */
  onObjectSort: (objectId: string, targetIndex: number) => void;
  objects: MapObject[];
  selectedObjectId: string | null;
  onObjectClick: (id: string) => void;
  onObjectDeselect: () => void;
  onObjectUpdate: (id: string, updates: Partial<MapObject>) => void;
  onObjectDelete: (id: string) => void;
  onImportData: (layers: Layer[], objects: MapObject[]) => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
}

// Sub-component for editing style
const LayerStyleEditor = ({
  style,
  onChange,
}: {
  style: LayerStyle;
  onChange: (s: LayerStyle) => void;
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor="border-color-input"
          className="text-xs font-semibold text-sidebar-foreground/70 uppercase"
        >
          Border Color
        </label>
        <div className="flex items-center gap-2">
          <input
            id="border-color-input"
            type="color"
            value={style.borderColor}
            onChange={(e) =>
              onChange({ ...style, borderColor: e.target.value })
            }
            className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
          />
          <span className="text-xs font-mono text-sidebar-foreground/80">
            {style.borderColor}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label
          htmlFor="fill-color-input"
          className="text-xs font-semibold text-sidebar-foreground/70 uppercase"
        >
          Fill Color
        </label>
        <div className="flex items-center gap-2">
          <input
            id="fill-color-input"
            type="color"
            value={style.fillColor}
            onChange={(e) => onChange({ ...style, fillColor: e.target.value })}
            className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
          />
          <span className="text-xs font-mono text-sidebar-foreground/80">
            {style.fillColor}
          </span>
        </div>
      </div>

      <div>
        <div className="flex justify-between mb-1">
          <label
            htmlFor="fill-opacity-input"
            className="text-xs font-semibold text-sidebar-foreground/70 uppercase"
          >
            Fill Opacity
          </label>
          <span className="text-xs text-sidebar-foreground/80">
            {(style.fillOpacity * 100).toFixed(0)}%
          </span>
        </div>
        <input
          id="fill-opacity-input"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={style.fillOpacity}
          onChange={(e) =>
            onChange({
              ...style,
              fillOpacity: Number.parseFloat(e.target.value),
            })
          }
          className="w-full h-1.5 bg-sidebar-accent rounded-lg appearance-none cursor-pointer"
        />
      </div>

      <div>
        <div className="flex justify-between mb-1">
          <label
            htmlFor="border-width-input"
            className="text-xs font-semibold text-sidebar-foreground/70 uppercase"
          >
            Border Width
          </label>
          <span className="text-xs text-sidebar-foreground/80">
            {style.borderWidth}px
          </span>
        </div>
        <input
          id="border-width-input"
          type="range"
          min="1"
          max="10"
          step="1"
          value={style.borderWidth}
          onChange={(e) =>
            onChange({ ...style, borderWidth: Number.parseInt(e.target.value) })
          }
          className="w-full h-1.5 bg-sidebar-accent rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
};

// Modal for editing layer settings (Single Layer)
const LayerSettingsModal = ({
  layer,
  onSave,
  onCancel,
  title = "Layer Settings",
  extraInfo,
}: {
  layer: Layer;
  onSave: (l: Layer) => void;
  onCancel: () => void;
  title?: string;
  extraInfo?: React.ReactNode;
}) => {
  const [editedLayer, setEditedLayer] = useState<Layer>(layer);

  return (
    <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-background rounded-lg shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-sidebar-border bg-sidebar-accent/50">
          <h3 className="font-bold text-sidebar-foreground flex items-center gap-2">
            <Settings size={18} />
            {title}
          </h3>
          <button
            onClick={onCancel}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {extraInfo}

          <div>
            <label
              htmlFor="layer-name-input"
              className="block text-sm font-medium text-sidebar-foreground mb-1"
            >
              Layer Name
            </label>
            <input
              id="layer-name-input"
              type="text"
              className="w-full border border-input bg-transparent rounded px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              value={editedLayer.name}
              onChange={(e) =>
                setEditedLayer({ ...editedLayer, name: e.target.value })
              }
            />
          </div>

          <div className="border-t border-sidebar-border pt-3">
            <h4 className="text-sm font-medium text-sidebar-foreground mb-2 flex items-center gap-2">
              <Palette size={14} /> Style
            </h4>
            <LayerStyleEditor
              style={editedLayer.style}
              onChange={(newStyle) =>
                setEditedLayer({ ...editedLayer, style: newStyle })
              }
            />
          </div>
        </div>

        <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/50 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(editedLayer)}
            className="px-4 py-2 text-sm text-primary-foreground bg-primary hover:bg-primary/90 rounded-md shadow-sm transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

const LayerSidebar = ({
  layers,
  activeLayerId,
  setActiveLayerId,
  toggleLayerVisibility,
  addLayer,
  deleteLayer,
  updateLayer,
  reorderLayer,
  onObjectLayerChange,
  onObjectSort,
  objects,
  selectedObjectId,
  onObjectClick,
  onObjectDeselect,
  onObjectUpdate,
  onObjectDelete,
  onImportData,
  onSaveProject,
  onLoadProject,
}: LayerSidebarProps) => {
  const [editingLayer, setEditingLayer] = useState<Layer | null>(null);
  const [importPreview, setImportPreview] = useState<{
    layers: Layer[];
    objects: MapObject[];
  } | null>(null);
  // Explicit expand/collapse choices, keyed by layer id. A layer with no
  // entry here follows the active layer, so a layer that becomes active via
  // delete/import/Firestore load opens itself instead of staying shut.
  const [openLayers, setOpenLayers] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await importFile(file);
      if (result.layers.length === 0) {
        alert("Nothing to import: the file contains no layers.");
        return;
      }
      setImportPreview(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Failed to import file:\n" + message);
      console.error(err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadProject(file);
    }
    if (projectInputRef.current) projectInputRef.current.value = "";
  };

  const selectedObject =
    selectedObjectId != null
      ? (objects.find((o) => o.id === selectedObjectId) ?? null)
      : null;

  // --- Drag and drop -------------------------------------------------------
  // Minimal dnd-kit setup: layers (sortable), objects (sortable within
  // their layer's grouped list, draggable across layers) and each layer's
  // object-list body (droppable zone) share one DndContext. The drop
  // outcome is decided once on dragEnd from (active, over) — the object
  // rows' own movement is the positional feedback.
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const command = toDragCommand(
        String(active.id),
        String(over.id),
        objects,
        layers,
      );
      if (command.type === "reorder") {
        reorderLayer(command.draggedLayerId, command.targetLayerId);
      } else if (command.type === "moveObject") {
        onObjectLayerChange(command.objectId, command.targetLayerId);
      } else if (command.type === "moveObjectAtIndex") {
        onObjectLayerChange(
          command.objectId,
          command.targetLayerId,
          command.targetIndex,
        );
      } else if (command.type === "reorderObject") {
        onObjectSort(command.objectId, command.targetIndex);
      }
    },
    [reorderLayer, onObjectLayerChange, onObjectSort, objects, layers],
  );

  return (
    <Sidebar collapsible="icon">
      {/* Header is hidden when collapsed to icons: its actions (save/open/import)
          need the full width, so icon mode shows content + footer only. */}
      <SidebarHeader><SidebarTrigger /></SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:hidden grid grid-rows-2">
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel className="mt-0 h-auto p-0 text-base font-bold text-sidebar-foreground flex items-center gap-2">
              Layers
            </SidebarGroupLabel>
            <div className="flex gap-1">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".kml,.kmz,.json,.geojson"
                onChange={handleImportFileChange}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={12} />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={addLayer}>
                <Plus size={12} />
              </Button>
              <input
                type="file"
                ref={projectInputRef}
                className="hidden"
                accept=".json"
                onChange={handleProjectFileChange}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                title="Save Project (Export JSON)"
                onClick={onSaveProject}
              >
                <Save size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Open Project (Import JSON - Replaces All)"
                onClick={() => projectInputRef.current?.click()}
              >
                <FolderOpen size={14} />
              </Button>
            </div>
          </div>
          <DndContext onDragEnd={handleDragEnd}>
            <SortableContext
              items={layers.map((l) => `layer:${l.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <SidebarMenu>
                {layers.length === 0 && (
                  <li className="px-3 py-3 text-xs text-sidebar-foreground/50">
                    No layers yet. Use “Add Layer” above to create one.
                  </li>
                )}
                {layers.map((layer) => {
                  const layerObjects = objects.filter(
                    (o) => o.layerId === layer.id,
                  );
                  const isActive = activeLayerId === layer.id;

                  return (
                    <SortableLayerRow
                      key={layer.id}
                      layer={layer}
                      objects={layerObjects}
                      isActive={isActive}
                      open={openLayers[layer.id] ?? isActive}
                      onOpenChange={(open) =>
                        setOpenLayers((prev) => ({ ...prev, [layer.id]: open }))
                      }
                      onActivate={() => setActiveLayerId(layer.id)}
                      canDelete
                      selectedObjectId={selectedObjectId}
                      onObjectClick={onObjectClick}
                      onObjectDeselect={onObjectDeselect}
                      renderObjectItem={(obj) => (
                        <DraggableObjectItem
                          key={obj.id}
                          obj={obj}
                          selected={selectedObjectId === obj.id}
                          onSelect={() => onObjectClick(obj.id)}
                          onDeselect={onObjectDeselect}
                        />
                      )}
                      onEdit={() => setEditingLayer(layer)}
                      onToggleVisibility={() => toggleLayerVisibility(layer.id)}
                      onDelete={() => deleteLayer(layer.id)}
                    />
                  );
                })}
              </SidebarMenu>
            </SortableContext>
          </DndContext>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden pt-3 border-t border-sidebar-border overflow-y-auto">
            {/* Persistent Properties panel: always labelled, with an empty-state
              message until an object is selected. Selection clears by picking
              another object rather than a close control. */}
            <SidebarGroupLabel className="mt-0 h-auto p-0 text-base font-bold text-sidebar-foreground flex items-center gap-2">
              Properties
            </SidebarGroupLabel>
            {selectedObject ? (
              <ObjectDetailsPanel
                key={selectedObject.id}
                obj={selectedObject}
                onUpdate={onObjectUpdate}
                onDelete={onObjectDelete}
              />
            ) : (
              <p className="text-xs text-sidebar-foreground/50 py-1">
                Select an object to view its properties.
              </p>
            )}
        </SidebarGroup>
      </SidebarContent>

      

      {/* Edit Layer Modal */}
      {editingLayer && (
        <LayerSettingsModal
          layer={editingLayer}
          onSave={(updatedLayer) => {
            updateLayer(updatedLayer);
            setEditingLayer(null);
          }}
          onCancel={() => setEditingLayer(null)}
        />
      )}

      {/* Import Preview Modal Logic */}
      {importPreview &&
        (importPreview.layers.length > 1 ? (
          // Multi-Layer Import Confirmation Modal
          <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-background rounded-lg shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-sidebar-border bg-sidebar-accent/50">
                <h3 className="font-bold text-sidebar-foreground flex items-center gap-2">
                  <FileJson size={18} />
                  Multi-Layer Import
                </h3>
                <button
                  onClick={() => setImportPreview(null)}
                  className="text-sidebar-foreground/50 hover:text-sidebar-foreground"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-primary/10 text-primary p-3 rounded-md border border-primary/20 text-sm">
                  <p className="font-semibold mb-1">Project File Detected</p>
                  <p>This file contains multiple layers.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-sidebar-accent/50 p-3 rounded-md border border-sidebar-border text-center">
                    <div className="text-xl font-bold text-sidebar-foreground">
                      {importPreview.layers.length}
                    </div>
                    <div className="text-xs text-sidebar-foreground/60 uppercase font-semibold">
                      Layers
                    </div>
                  </div>
                  <div className="bg-sidebar-accent/50 p-3 rounded-md border border-sidebar-border text-center">
                    <div className="text-xl font-bold text-sidebar-foreground">
                      {importPreview.objects.length}
                    </div>
                    <div className="text-xs text-sidebar-foreground/60 uppercase font-semibold">
                      Objects
                    </div>
                  </div>
                </div>
                <p className="text-xs text-sidebar-foreground/60">
                  Importing will add these layers to your current map. Existing
                  layers will be kept.
                </p>
              </div>
              <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/50 flex justify-end gap-2">
                <button
                  onClick={() => setImportPreview(null)}
                  className="px-4 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onImportData(importPreview.layers, importPreview.objects);
                    setImportPreview(null);
                  }}
                  className="px-4 py-2 text-sm text-primary-foreground bg-primary hover:bg-primary/90 rounded-md shadow-sm transition-colors"
                >
                  Import Layers
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Single Layer Import (Original Behavior)
          <LayerSettingsModal
            layer={importPreview.layers[0]}
            title="Import Layer Preview"
            extraInfo={
              <div
                className={`text-sm p-3 rounded-md flex items-center gap-2 mb-2 ${
                  importPreview.objects.length > 0
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
                }`}
              >
                {importPreview.objects.length > 0 ? (
                  <>
                    <Layers size={16} />
                    <span>
                      Found <strong>{importPreview.objects.length}</strong>{" "}
                      objects.
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={16} />
                    <span>
                      No objects found in file! The layer will be empty.
                    </span>
                  </>
                )}
              </div>
            }
            onSave={(finalLayer) => {
              // Pass as single-item array
              onImportData([finalLayer], importPreview.objects);
              setImportPreview(null);
            }}
            onCancel={() => setImportPreview(null)}
          />
        ))}
    </Sidebar>
  );
};

export default LayerSidebar;
