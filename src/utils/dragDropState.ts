import type { Layer, MapObject } from '../types';

/**
 * Pure drag-and-drop state transformations.
 *
 * Surface: reorder layers, reorder objects within a layer, move objects
 * between layers (append or at an index), and decode dnd-kit item ids into
 * DragCommands. All transforms are pure and return the original reference
 * when an operation is a no-op, so callers can skip state updates and
 * persistence entirely.
 *
 * Object ordering is carried by each layer's optional `objectOrder` id list
 * (see types.ts). Ordering transforms operate on that list; the flat objects
 * array itself is never reordered.
 */

/**
 * Reorders `layers` so that `draggedId` sits in the position currently
 * occupied by `targetId`. Returns the original array reference when the
 * operation is a no-op (same element, unknown ids) so callers can skip state
 * updates and persistence entirely.
 */
export function reorderLayers(layers: Layer[], draggedId: string, targetId: string): Layer[] {
  if (draggedId === targetId) return layers;

  const fromIndex = layers.findIndex((l) => l.id === draggedId);
  const toIndex = layers.findIndex((l) => l.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return layers;

  const next = [...layers];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Re-parents one map object onto another layer (flat array only). Returns
 * the original array reference when the object is already in that layer or
 * does not exist. ordering bookkeeping happens at the applyDragCommand level.
 */
export function moveObjectToLayer(
  objects: MapObject[],
  objectId: string,
  targetLayerId: string
): MapObject[] {
  const target = objects.find((o) => o.id === objectId);
  if (!target || target.layerId === targetLayerId) return objects;

  return objects.map((o) =>
    o.id === objectId ? { ...o, layerId: targetLayerId } : o
  );
}

/**
 * Moves an object id to a target index within an objectOrder list. No-op
 * (same reference) when the id is not present or the index is unchanged.
 */
export function reorderObjectInLayer(
  order: string[],
  objectId: string,
  targetIndex: number
): string[] {
  const fromIndex = order.indexOf(objectId);
  if (fromIndex === -1) return order;
  const clamped = Math.max(0, Math.min(targetIndex, order.length - 1));
  if (clamped === fromIndex) return order;

  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clamped, 0, moved);
  return next;
}

/**
 * The display order of a layer's objects: objectOrder filtered to current
 * members, with any not-yet-ordered members appended (natural order).
 */
export function displayedObjectIds(layer: Layer, objects: MapObject[]): string[] {
  const memberIds = objects
    .filter((o) => o.layerId === layer.id)
    .map((o) => o.id);
  const memberSet = new Set(memberIds);

  const kept = (layer.objectOrder ?? []).filter((id) => memberSet.has(id));
  const keptSet = new Set(kept);
  const missing = memberIds.filter((id) => !keptSet.has(id));
  return [...kept, ...missing];
}

/**
 * Reconciles a layer's objectOrder against the objects that actually belong
 * to it: drops stale ids, appends missing ones. Returns undefined when the
 * list is already correct, so callers can skip a persistence write.
 */
export function reconcileObjectOrder(
  layerId: string,
  order: string[] | undefined,
  objects: MapObject[]
): string[] | undefined {
  const ids = displayedObjectIds({ ...emptyLayer(), id: layerId, objectOrder: order }, objects);
  if (order !== undefined && ids.length === order.length && ids.every((id, i) => id === order[i])) {
    return undefined;
  }
  return ids;
}

const emptyLayer = (): Layer => ({
  id: '',
  name: '',
  visible: true,
  style: { borderColor: '', borderWidth: 1, fillColor: '', fillOpacity: 0 },
});

/**
 * dnd-kit ids are prefixed (`layer:<id>`, `object:<id>`, `zone:<id>`) so one
 * DndContext can hold all kinds without id collisions.
 */
export function toLayerId(dndId: string): string {
  return dndId.startsWith('layer:') ? dndId.slice('layer:'.length) : dndId;
}

export function toObjectId(dndId: string): string {
  return dndId.startsWith('object:') ? dndId.slice('object:'.length) : dndId;
}

export function isObjectId(dndId: string): boolean {
  return dndId.startsWith('object:');
}

/** Id of the droppable object-list body rendered on every layer. */
export function layerZoneId(layerId: string): string {
  return `zone:${layerId}`;
}

export type DragCommand =
  | { type: 'none' }
  | { type: 'reorder'; draggedLayerId: string; targetLayerId: string }
  | { type: 'reorderObject'; objectId: string; targetIndex: number }
  | { type: 'moveObject'; objectId: string; targetLayerId: string }
  | { type: 'moveObjectAtIndex'; objectId: string; targetLayerId: string; targetIndex: number };

/**
 * Map an (active, over) id pair onto the state command the drop represents.
 *
 * Resolution needs workspace data in two places:
 * - object-over-layer-row / object-over-zone drops decode without data.
 * - object-over-object drops need the target object's layer and its index
 *   in the *displayed* order of that layer, so the flat objects array and
 *   layer list are passed in (kept optional for the data-free cases).
 */
export function toDragCommand(
  activeId: string,
  overId: string,
  objects: MapObject[] = [],
  layers: Layer[] = []
): DragCommand {
  const activeKind = activeId.split(':')[0];
  const overKind = overId.split(':')[0];

  if (activeKind === 'layer') {
    const draggedLayerId = toLayerId(activeId);
    const targetLayerId = toLayerId(overId);
    return draggedLayerId === targetLayerId
      ? { type: 'none' }
      : { type: 'reorder', draggedLayerId, targetLayerId };
  }

  console.log('activeKind: ' + activeKind + ', overKind: ' + overKind);

  if (activeKind === 'object') {
    const objectId = toObjectId(activeId);
    const source = objects.find((o) => o.id === objectId);

    if (overKind === 'layer') {
      return { type: 'moveObject', objectId, targetLayerId: toLayerId(overId) };
    }
    if (overKind === 'zone') {
      return { type: 'moveObject', objectId, targetLayerId: overId.slice('zone:'.length) };
    }
    if (overKind === 'object') {
      const targetObjectId = toObjectId(overId);
      const target = objects.find((o) => o.id === targetObjectId);
      if (!target || !source) return { type: 'none' };

      const targetLayer = layers.find((l) => l.id === target.layerId);
      if (!targetLayer) return { type: 'none' };

      if (target.layerId === source.layerId) {
        const displayed = displayedObjectIds(targetLayer, objects);
        const index = displayed.indexOf(targetObjectId);
        return index === -1
          ? { type: 'none' }
          : { type: 'reorderObject', objectId, targetIndex: index };
      }

      const targetDisplayed = displayedObjectIds(targetLayer, objects);
      const index = targetDisplayed.indexOf(targetObjectId);
      return index === -1
        ? { type: 'moveObject', objectId, targetLayerId: target.layerId }
        : { type: 'moveObjectAtIndex', objectId, targetLayerId: target.layerId, targetIndex: index };
    }
  }

  return { type: 'none' };
}

/** Workspace snapshot a command is applied to. */
export interface DragStateInput {
  layers: Layer[];
  objects: MapObject[];
}

export interface DragStateOutput extends DragStateInput {
  /** Changed layers (fresh objectOrder); these are the docs to persist. */
  changedLayers: Layer[];
  /** The reparented object for cross-layer moves; the doc to persist. */
  movedObject: MapObject | null;
}

const NO_CHANGE: Omit<DragStateOutput, 'layers' | 'objects'> = {
  changedLayers: [],
  movedObject: null,
};

/**
 * Applies a decoded drag command to full workspace state in one pure step.
 * Returns the original `layers`/`objects` references back when the command
 * is a no-op, so the caller can skip both the state update and persistence.
 */
export function applyDragCommand(
  state: DragStateInput,
  command: DragCommand
): DragStateOutput {
  switch (command.type) {
    case 'none':
      return { ...state, ...NO_CHANGE };

    case 'reorder': {
      const nextLayers = reorderLayers(state.layers, command.draggedLayerId, command.targetLayerId);
      if (nextLayers === state.layers) return { ...state, ...NO_CHANGE };
      return { ...state, layers: nextLayers, ...NO_CHANGE };
    }

    case 'reorderObject': {
      const obj = state.objects.find((o) => o.id === command.objectId);
      if (!obj) return { ...state, ...NO_CHANGE };

      const sourceLayer = state.layers.find((l) => l.id === obj.layerId);
      if (!sourceLayer) return { ...state, ...NO_CHANGE };

      // Reconcile first so stale entries (imports/deletes) self-heal before
      // the splice; the moved object must be a member of the list.
      const reconciled =
        reconcileObjectOrder(sourceLayer.id, sourceLayer.objectOrder, state.objects);
      const base = reconciled ?? sourceLayer.objectOrder ?? [];
      const nextOrder = reorderObjectInLayer(base, obj.id, command.targetIndex);

      if (!reconciled && nextOrder === sourceLayer.objectOrder) {
        return { ...state, ...NO_CHANGE };
      }

      const layers = state.layers.map((l) =>
        l.id === sourceLayer.id ? { ...l, objectOrder: nextOrder } : l
      );
      return { ...state, layers, changedLayers: [{ ...sourceLayer, objectOrder: nextOrder }], movedObject: null, };
    }

    case 'moveObject':
    case 'moveObjectAtIndex': {
      const obj = state.objects.find((o) => o.id === command.objectId);
      if (!obj) return { ...state, ...NO_CHANGE };
      const targetLayer = state.layers.find((l) => l.id === command.targetLayerId);
      if (!targetLayer) return { ...state, ...NO_CHANGE };

      const nextObjects = moveObjectToLayer(state.objects, obj.id, targetLayer.id);
      if (nextObjects === state.objects) return { ...state, ...NO_CHANGE };

      const movedObject: MapObject = { ...obj, layerId: targetLayer.id };
      const changedLayers: Layer[] = [];

      const layers = state.layers.map((l) => {
        // Source layer: drop the moved id from its order.
        if (l.id === obj.layerId) {
          const previous = l.objectOrder ?? [];
          const order = previous.filter((id) => id !== obj.id);
          if (order.length === previous.length) return l; // id absent: unchanged
          changedLayers.push({ ...l, objectOrder: order });
          return { ...l, objectOrder: order };
        }
        // Target layer: reconcile, then append at end or insert at index.
        if (l.id === targetLayer.id) {
          const reconciled = reconcileObjectOrder(l.id, l.objectOrder, nextObjects);
          const base = reconciled ?? l.objectOrder ?? [];
          const withoutMoved = base.filter((id) => id !== obj.id);
          const order =
            command.type === 'moveObjectAtIndex'
              ? (() => {
                  const clamped = Math.max(0, Math.min(command.targetIndex, withoutMoved.length));
                  const withMoved = [...withoutMoved];
                  withMoved.splice(clamped, 0, obj.id);
                  return withMoved;
                })()
              : [...withoutMoved, obj.id];
          changedLayers.push({ ...l, objectOrder: order });
          return { ...l, objectOrder: order };
        }
        return l;
      });

      return { layers, objects: nextObjects, changedLayers, movedObject };
    }
  }
}
