import { useEffect, useState } from 'react';
import type { Layer, MapObject } from '../types';
import {
  loadUserData,
  saveLayers,
  saveObject,
  deleteObject as deleteObjectInStore,
  saveObjectsBatch
} from '../utils/firebase';
import {
  assignFreshIds,
  createLayer,
  deleteLayerCascade,
  repairActiveLayerId
} from '../utils/workspaceState';
import { applyDragCommand, toDragCommand, type DragCommand } from '../utils/dragDropState';

// The workspace starts empty — layers are created by the user from the sidebar.
const DEFAULT_LAYERS: Layer[] = [];

/**
 * Facade over the persisted workspace (layers, objects, active layer).
 *
 * Responsibilities:
 * - Load from Firestore on sign-in; reset to the empty workspace on sign-out.
 * - Keep the active layer invariant (it must always reference an existing
 *   layer, '' when none do).
 * - Persist every mutation for signed-in users.
 *
 * Actions are intent-based so components never manipulate raw state, with one
 * exception: setObjects is exposed because MapBoard performs its own optimistic
 * updates through the React setter contract it was built against.
 */
export function useWorkspace(uid: string | null) {
  const [layers, setLayers] = useState<Layer[]>(DEFAULT_LAYERS);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>('');

  // Load when a session appears; setState runs in the load callback, not in
  // the effect body. The cancelled flag keeps a slow load from repopulating
  // state after the user has already signed out.
  useEffect(() => {
    if (!uid) return;

    let cancelled = false;
    loadUserData(uid)
      .then((data) => {
        if (cancelled) return;
        // No stored layers: keep the empty default, there is nothing to persist.
        setLayers(data.layers ?? DEFAULT_LAYERS);
        setObjects(data.objects);
      })
      .catch((err) => console.error('Failed to load user data:', err));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Sign-out reset: render-phase state adjustment (the React-endorsed
  // alternative to a setState-in-effect reset) — when the session id changes,
  // clear back to the empty workspace so nothing renders against stale data.
  const [prevUid, setPrevUid] = useState(uid);
  if (prevUid !== uid) {
    setPrevUid(uid);
    if (!uid) {
      setLayers(DEFAULT_LAYERS);
      setObjects([]);
      setActiveLayerId('');
    }
  }

  // Data integrity: ensure the active layer always exists locally.
  // Render-phase state adjustment (the React-endorsed alternative to a
  // setState-in-effect reset): compare against a snapshot of the previous
  // values and repair state only when they actually changed. With zero layers
  // there is nothing to select, so the id is cleared rather than left dangling —
  // otherwise every object drawn afterwards would be assigned to a layer that
  // does not exist.
  const [prevLayerState, setPrevLayerState] = useState({ layers, activeLayerId });
  if (prevLayerState.layers !== layers || prevLayerState.activeLayerId !== activeLayerId) {
    setPrevLayerState({ layers, activeLayerId });
    const repaired = repairActiveLayerId(layers, activeLayerId);
    if (repaired !== activeLayerId) {
      setActiveLayerId(repaired);
    }
  }

  // Persistence is fire-and-forget by design (optimistic UI); failures are
  // logged instead of left as unhandled promise rejections.
  const persist = (operation: () => Promise<unknown>) => {
    operation().catch((err) => console.error('Workspace persistence failed:', err));
  };

  /** Replace the layer list and persist it. */
  const commitLayers = (transform: (current: Layer[]) => Layer[]) => {
    const nextLayers = transform(layers);
    setLayers(nextLayers);
    if (uid) persist(() => saveLayers(uid, nextLayers));
  };

  const addLayer = () => {
    const newLayer = createLayer(layers.length);
    commitLayers((current) => [...current, newLayer]);
    setActiveLayerId(newLayer.id);
  };

  const deleteLayer = (layerId: string) => {
    if (layers.length === 0) return;

    const removedObjects = objects.filter((o) => o.layerId === layerId);
    const next = deleteLayerCascade({ layers, objects, activeLayerId }, layerId);
    setLayers(next.layers);
    setObjects(next.objects);
    setActiveLayerId(next.activeLayerId);

    if (uid) {
      persist(() => saveLayers(uid, next.layers));
      removedObjects.forEach((obj) => persist(() => deleteObjectInStore(uid, obj.id)));
    }
  };

  const toggleLayerVisibility = (layerId: string) => {
    commitLayers((current) =>
      current.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    );
  };

  const updateLayer = (updatedLayer: Layer) => {
    commitLayers((current) =>
      current.map((l) => (l.id === updatedLayer.id ? updatedLayer : l))
    );
  };

  /** Applies a decoded drag command to workspace state in one step and
   * persists exactly the touched documents (changed layers via one layers
   * write, plus the moved object doc for cross-layer drops). No-op commands
   * short-circuit before any state update or Firestore write, which is
   * what keeps a wasted drop onto the object's own position free. */
  const dispatchDragCommand = (command: DragCommand) => {
    const result = applyDragCommand({ layers, objects }, command);
    const untouched =
      result.layers === layers &&
      result.objects === objects &&
      result.changedLayers.length === 0 &&
      result.movedObject === null;
    if (untouched) return;

    setLayers(result.layers);
    setObjects(result.objects);
    if (uid) {
      if (result.changedLayers.length > 0) {
        persist(() => saveLayers(uid, result.layers));
      }
      if (result.movedObject) {
        persist(() => saveObject(uid, result.movedObject as MapObject));
      }
    }
  };

  /** Reorder layers after a drag-and-drop drop; persists the new order. */
  const reorderLayer = (draggedId: string, targetId: string) => {
    dispatchDragCommand(
      toDragCommand(`layer:${draggedId}`, `layer:${targetId}`)
    );
  };

  /** Move an object to another layer after a drag-and-drop drop, optionally
   * at an explicit position in the target layer's display order. A drop back
   * onto the object's own layer is suppressed entirely: no state update and
   * no Firestore write. */
  const moveObjectToLayerAt = (objectId: string, targetLayerId: string, targetIndex?: number) => {
    dispatchDragCommand(
      targetIndex === undefined
        ? toDragCommand(`object:${objectId}`, `layer:${targetLayerId}`)
        : { type: 'moveObjectAtIndex', objectId, targetLayerId, targetIndex }
    );
  };

  /** Re-sort an object within its own layer, persisting the layer's order. */
  const reorderObjectInLayerAt = (objectId: string, targetIndex: number) => {
    dispatchDragCommand({ type: 'reorderObject', objectId, targetIndex });
  };

  /** Persist an object the map has already applied optimistically (create or update). */
  const persistObject = (obj: MapObject) => {
    if (uid) persist(() => saveObject(uid, obj));
  };

  /** Patch an object from the details panel: optimistic local update + persistence. */
  const patchObject = (id: string, updates: Partial<MapObject>) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } as MapObject : o)));
    const target = objects.find((o) => o.id === id);
    if (target && uid) {
      persist(() => saveObject(uid, { ...target, ...updates } as MapObject));
    }
  };

  const deleteObject = (id: string) => {
    setObjects((prev) => prev.filter((o) => o.id !== id));
    if (uid) persist(() => deleteObjectInStore(uid, id));
  };

  /** Replace layers+objects in one go and persist (batched writes for imports). */
  const commitAll = (nextLayers: Layer[], nextObjects: MapObject[], batch: MapObject[]) => {
    setLayers(nextLayers);
    setObjects(nextObjects);
    if (uid) {
      persist(() => saveLayers(uid, nextLayers));
      persist(() => saveObjectsBatch(uid, batch));
    }
  };

  /** Merge imported data after regenerating ids to prevent collisions. */
  const importData = (newLayers: Layer[], newObjects: MapObject[]) => {
    const { layers: remappedLayers, objects: remappedObjects } = assignFreshIds(newLayers, newObjects);
    const finalLayers = [...layers, ...remappedLayers];
    const finalObjects = [...objects, ...remappedObjects];

    commitAll(finalLayers, finalObjects, remappedObjects);

    // Set active layer to the first imported one
    if (remappedLayers.length > 0) {
      setActiveLayerId(remappedLayers[0].id);
    }
  };

  /**
   * Replace the whole workspace (project-file load). Old cloud objects are not
   * deleted first, the new set is written on top — a known, documented gap.
   */
  const replaceAll = (loadedLayers: Layer[], loadedObjects: MapObject[]) => {
    commitAll(loadedLayers, loadedObjects, loadedObjects);
    if (loadedLayers.length > 0) {
      setActiveLayerId(loadedLayers[0].id);
    }
  };

  return {
    layers,
    objects,
    activeLayerId,
    setActiveLayerId,
    setObjects,
    addLayer,
    deleteLayer,
    toggleLayerVisibility,
    updateLayer,
    reorderLayer,
    moveObjectToLayerAt,
    reorderObjectInLayerAt,
    persistObject,
    patchObject,
    deleteObject,
    importData,
    replaceAll
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
