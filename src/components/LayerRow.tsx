import { forwardRef, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Layer, MapObject } from '../types'
import { layerZoneId, displayedObjectIds } from '../utils/dragDropState'
import {
  Eye,
  EyeOff,
  Trash2,
  ChevronRight,
  Settings,
  GripVertical,
  MapPin,
  Circle,
  PenTool,
  Hexagon,
  Image,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import {
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

interface LayerRowProps {
  layer: Layer
  /** Objects in the layer's persisted display order (already resolved by
   * SortableLayerRow via displayedObjectIds). */
  objects: MapObject[]
  isActive: boolean
  /** Whether this layer's object list is expanded. */
  open: boolean
  onOpenChange: (open: boolean) => void
  onActivate: () => void
  canDelete: boolean
  selectedObjectId: string | null
  onObjectClick: (id: string) => void
  onObjectDeselect: () => void
  onEdit: () => void
  onToggleVisibility: () => void
  onDelete: () => void
  /** Row dims while it is being dragged. */
  isDragging?: boolean
  /** Ref for the droppable body zone around the object list. */
  zoneRef?: (element: HTMLElement | null) => void
  /** dnd-kit attributes+listeners for the grip handle and its activator ref. */
  handleProps?: HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }
  /** Optional render override for object rows (lets the parent supply
   * draggable object items). Defaults to a plain selectable row. */
  renderObjectItem?: (obj: MapObject) => ReactNode
}

const LayerRow = forwardRef<HTMLLIElement, LayerRowProps>(({
  layer,
  objects: layerObjects,
  isActive,
  open,
  onOpenChange,
  onActivate,
  canDelete,
  selectedObjectId,
  onObjectClick,
  onObjectDeselect,
  onEdit,
  onToggleVisibility,
  onDelete,
  isDragging = false,
  zoneRef,
  handleProps,
  renderObjectItem,
}, ref) => (
  <Collapsible open={open} onOpenChange={onOpenChange} className="group/collapsible">
    <SidebarMenuItem ref={ref as never}>
      <div className={cn("flex items-center gap-0.5", isActive && !isDragging && "border-l-2 border-sidebar-primary")}>
        <span
          role="button"
          tabIndex={0}
          title="Drag to reorder"
          aria-label="Drag to reorder"
          data-testid="drag-handle"
          aria-roledescription="sortable"
          className={cn(
            "text-sidebar-foreground/40 hover:text-sidebar-foreground cursor-grab active:cursor-grabbing shrink-0 group-data-[collapsible=icon]:hidden"
          )}
          {...handleProps}
        >
          <GripVertical size={14} />
        </span>
        <SidebarMenuButton
          isActive={isActive}
          className="flex-1 min-w-0"
          onClick={onActivate}
          title={`Set ${layer.name} as the active layer`}
        >
          <span
            className={cn(
              "w-3 h-3 rounded-full shrink-0 border border-sidebar-border group-data-[collapsible=icon]:hidden",
              !layer.visible && "opacity-40"
            )}
            style={{
              backgroundColor: layer.style.fillColor,
              borderColor: layer.style.borderColor,
            }}
          />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {layer.name}
          </span>
          <span className="ml-auto text-[10px] text-sidebar-foreground/50 tabular-nums group-data-[collapsible=icon]:hidden">
            ({layerObjects.length})
          </span>
        </SidebarMenuButton>

        <Button
          variant="ghost"
          size="icon-xs"
          title={open ? "Collapse layer objects" : "Expand layer objects"}
          aria-label={open ? "Collapse layer objects" : "Expand layer objects"}
          aria-expanded={open}
          className="group-data-[collapsible=icon]:hidden"
          onClick={() => onOpenChange(!open)}
        >
          <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
        </Button>

        <div
          className={cn(
            "flex items-center gap-0.5",
            "group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none",
            "group-data-[collapsible=icon]:group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:group-hover/menu-item:pointer-events-auto",
            "group-data-[collapsible=icon]:group-focus-within/menu-item:opacity-100 group-data-[collapsible=icon]:group-focus-within/menu-item:pointer-events-auto"
          )}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            title="Layer settings"
            aria-label="Layer settings"
            onClick={onEdit}
          >
            <Settings size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title={layer.visible ? "Hide layer" : "Show layer"}
            aria-label={layer.visible ? "Hide layer" : "Show layer"}
            onClick={onToggleVisibility}
          >
            {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete layer"
              aria-label="Delete layer"
              className="hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <SidebarGroupContent>
          <div
            ref={zoneRef}
            data-testid="layer-body-zone"
            className="pl-4 rounded-b"
          >
            <SortableContext
              items={layerObjects.map((obj) => `object:${obj.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <SidebarMenu>
                {layerObjects.length === 0 ? (
                  <li className="px-2 py-1.5 text-xs italic text-sidebar-foreground/50">
                    No objects in this layer
                  </li>
                ) : (
                  layerObjects.map((obj) =>
                    renderObjectItem ? (
                      renderObjectItem(obj)
                    ) : (
                      <SidebarMenuItem key={obj.id}>
                        <SidebarMenuButton
                          isActive={selectedObjectId === obj.id}
                          onClick={() => {
                            if (selectedObjectId === obj.id) {
                              onObjectDeselect()
                            } else {
                              onObjectClick(obj.id)
                            }
                          }}
                          tooltip={obj.title || "Untitled Object"}
                        >
                          <span className="opacity-70">{getObjectIcon(obj.type)}</span>
                          <span className="truncate">
                            {obj.title || "Untitled Object"}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  )
                )}
              </SidebarMenu>
            </SortableContext>
          </div>
        </SidebarGroupContent>
      </CollapsibleContent>
    </SidebarMenuItem>
  </Collapsible>
))

LayerRow.displayName = 'LayerRow'

const getObjectIcon = (type: MapObject['type']) => {
  switch (type) {
    case 'point':
      return <MapPin size={14} />
    case 'circle':
      return <Circle size={14} />
    case 'polyline':
      return <PenTool size={14} />
    case 'polygon':
      return <Hexagon size={14} />
    case 'image':
      return <Image size={14} />
  }
}

/** Sortable + droppable wrapper for layer rows:
 * - sortable: reorder layers by dragging the grip handle;
 * - its CollapsibleContent body is a droppable zone accepting objects
 *   dragged from any layer, including empty layers.
 * `data.kind` lets the DndContext distinguish drop outcomes.
 */
const SortableLayerRow = (props: Omit<LayerRowProps, 'handleProps'>) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: `layer:${props.layer.id}`, data: { kind: 'layer', layerId: props.layer.id } })

  // Kept wired so the DndContext still receives over-zone events. The
  // highlight visual is intentionally suppressed for now.
  useDroppable({
    id: layerZoneId(props.layer.id),
    data: { kind: 'zone', layerId: props.layer.id },
  })

  // Objects in their persisted display order so each layer's SortableContext
  // indexes match what the user sees (and what reorderObject pokes).
  const orderedObjects = displayedObjectIds(props.layer, props.objects)
    .map((id) => props.objects.find((o) => o.id === id))
    .filter((o): o is MapObject => o !== undefined)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <LayerRow
        {...props}
        objects={orderedObjects}
        handleProps={{
          ref: setActivatorNodeRef,
          ...attributes,
          ...listeners,
        }}
      />
    </div>
  )
}

/** One map object row inside an expanded layer. Both sortable (reorders
 * within its layer's grouped list) and draggable across layers: drop onto
 * another layer's body zone or row to move. Drag listeners live only on the
 * handle — never the row body — so click-to-select behavior is untouched.
 * Visual feedback during a grab is intentionally suppressed for now. */
const DraggableObjectItem = ({
  obj,
  selected,
  onSelect,
  onDeselect,
}: {
  obj: MapObject
  selected: boolean
  onSelect: () => void
  onDeselect: () => void
}) => {
  const _sortable = useSortable({
    id: `object:${obj.id}`,
    data: { kind: 'object', layerId: obj.layerId },
  })

  return (
    <SidebarMenuItem>
      <span
        data-testid="object-drag-handle"
        title="Drag to another layer"
        className={cn(
          'text-sidebar-foreground/40 hover:text-sidebar-foreground cursor-grab active:cursor-grabbing shrink-0 group-data-[collapsible=icon]:hidden'
        )}
        {..._sortable.attributes}
        {..._sortable.listeners}
        // dnd-kit attributes supply role/tabIndex/aria-roledescription;
        // the spoken label is ours and must win over the generated one.
        aria-label="Drag to another layer"
      >
      </span>
      <SidebarMenuButton
        isActive={selected}
        onClick={() => (selected ? onDeselect() : onSelect())}
        tooltip={obj.title || 'Untitled Object'}
        className="justify-between"
      >
        <span className="truncate">{obj.title || 'Untitled Object'}</span>
        <span className="opacity-50">{getObjectIcon(obj.type)}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export default LayerRow
export { SortableLayerRow, DraggableObjectItem }
