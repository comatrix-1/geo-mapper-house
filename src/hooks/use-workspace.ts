import { useEffect, useRef, useState } from 'react';
import type { Layer, MapObject, MapObjectImage } from '../types';
import {
  loadUserData,
  saveLayers,
  saveObject,
  deleteObject as deleteObjectInStore,
  appendObjectImages as appendObjectImagesInStore,
  removeObjectImage as removeObjectImageInStore,
  getObject,
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

const imageReferenceKey = (image: MapObjectImage) =>
  JSON.stringify([
    image.id,
    image.imageUrl,
    image.fileName,
    image.storagePath ?? null,
    image.storageOwnerId ?? null,
  ]);

export type AppendObjectImagesResult =
  | { status: 'attached' }
  | { status: 'missing' }
  | { status: 'failed'; error: unknown; confirmedImages: MapObjectImage[] };

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
  const objectsRef = useRef(objects);
  const imageWriteQueues = useRef(new Map<string, Promise<void>>());
  const [activeLayerId, setActiveLayerId] = useState<string>('');

  const setWorkspaceObjects: typeof setObjects = (action) => {
    const next = typeof action === 'function' ? action(objectsRef.current) : action;
    objectsRef.current = next;
    setObjects(next);
  };

  const setObjectsPreservingImages: typeof setObjects = (action) => {
    const current = objectsRef.current;
    const requested = typeof action === 'function' ? action(current) : action;
    const next = requested.map((object) => {
      const currentObject = current.find((candidate) => candidate.id === object.id);
      return currentObject ? { ...object, images: currentObject.images } : object;
    });
    setWorkspaceObjects(next);
  };

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
        setWorkspaceObjects(data.objects);
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

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

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

  // Like persist, but the error is logged here and rethrown so an awaiting
  // caller can react to the failure before any dependent side effects.
  // Use when the caller must await or reconcile the result (e.g. attachments).
  const persistAwaitable = (operation: () => Promise<unknown>) =>
    operation().catch((err) => {
      console.error('Workspace persistence failed:', err);
      throw err;
    });

  const withObjectImageLock = <T,>(
    id: string,
    operation: (object: MapObject | undefined) => Promise<T>,
  ): Promise<T> => {
    const queues = imageWriteQueues.current;
    const previous = queues.get(id) ?? Promise.resolve();
    const result = previous
      .catch(() => undefined)
      .then(() => operation(objectsRef.current.find((object) => object.id === id)));
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    queues.set(id, tail);
    void tail.then(() => {
      if (queues.get(id) === tail) queues.delete(id);
    });
    return result;
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
    setWorkspaceObjects(next.objects);
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
    setWorkspaceObjects(result.objects);
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
    const current = objectsRef.current.find((object) => object.id === obj.id);
    const objectToSave = current ? { ...obj, images: current.images } : obj;
    if (uid) persist(() => saveObject(uid, objectToSave));
  };

  /** Patch an object from the details panel: optimistic local update + persistence. */
  const patchObject = (id: string, updates: Partial<MapObject>) => {
    const target = objectsRef.current.find((o) => o.id === id);
    if (!target) return;
    const updatedObject = { ...target, ...updates, images: target.images } as MapObject;
    setWorkspaceObjects((prev) => prev.map((o) => (o.id === id ? updatedObject : o)));
    if (uid) {
      persist(() => saveObject(uid, updatedObject));
    }
  };

  /** Append uploaded images without racing removal or deletion. Persistence
   * failures reconcile local images to the stored document and return which
   * uploads have a confirmed reference for caller cleanup. */
  const appendObjectImages = (id: string, newImages: MapObjectImage[]) =>
    withObjectImageLock(id, async (target): Promise<AppendObjectImagesResult> => {
      if (!target || !uid) return { status: 'missing' };

      const existingImageKeys = new Set((target.images ?? []).map(imageReferenceKey));
      const imagesToAppend = newImages.filter(
        (image) => !existingImageKeys.has(imageReferenceKey(image)),
      );
      setWorkspaceObjects((prev) =>
        prev.map((o) =>
          o.id === id ? ({ ...o, images: [...(o.images ?? []), ...imagesToAppend] } as MapObject) : o
        )
      );

      const rollbackAppend = () => {
        const appendedImageKeys = new Set(imagesToAppend.map(imageReferenceKey));
        setWorkspaceObjects((prev) =>
          prev.map((o) =>
            o.id === id
              ? {
                  ...o,
                  images: (o.images ?? []).filter(
                    (image) => !appendedImageKeys.has(imageReferenceKey(image)),
                  ),
                }
              : o
          )
        );
      };

      try {
        await persistAwaitable(() => appendObjectImagesInStore(uid, id, newImages));
        return { status: 'attached' };
      } catch (error) {
        if ((error as { code?: string } | null)?.code === 'not-found') {
          rollbackAppend();
          return { status: 'missing' };
        }

        let storedObject: MapObject | null;
        try {
          storedObject = await getObject(uid, id);
        } catch (reconcileError) {
          console.error('Failed to reconcile image attachments:', reconcileError);
          throw error;
        }
        if (!storedObject) {
          rollbackAppend();
          return { status: 'missing' };
        }

        const storedImages = storedObject.images ?? [];
        setWorkspaceObjects((prev) =>
          prev.map((o) => (o.id === id ? { ...o, images: storedImages } as MapObject : o))
        );
        const confirmedImages = newImages.filter((image) =>
          storedImages.some(
            (stored) => stored.id === image.id && stored.storagePath === image.storagePath,
          )
        );
        return { status: 'failed', error, confirmedImages };
      }
    });

  /** Persist removal before updating local state so a failed save can be retried. */
  const removeObjectImage = (id: string, imageId: string) =>
    withObjectImageLock(id, async (target) => {
      const imageExists = target?.images?.some((image) => image.id === imageId);
      if (!target || !imageExists) return false;

      if (uid) {
        const removed = await persistAwaitable(() => removeObjectImageInStore(uid, id, imageId));
        if (!removed) return false;
      }
      setWorkspaceObjects((prev) =>
        prev.map((object) =>
          object.id === id
            ? { ...object, images: (object.images ?? []).filter((image) => image.id !== imageId) }
            : object
        )
      );
      return true;
    });

  const removeObjectLocally = (id: string) => {
    setWorkspaceObjects((prev) => prev.filter((o) => o.id !== id));
  };

  const deleteObject = (id: string) => {
    return withObjectImageLock(id, async (target) => {
      if (!target) return;
      removeObjectLocally(id);
      if (uid) persist(() => deleteObjectInStore(uid, id));
    });
  };

  /** Replace layers+objects in one go and persist (batched writes for imports). */
  const commitAll = (nextLayers: Layer[], nextObjects: MapObject[], batch: MapObject[]) => {
    setLayers(nextLayers);
    setWorkspaceObjects(nextObjects);
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
    setObjects: setObjectsPreservingImages,
    addLayer,
    deleteLayer,
    toggleLayerVisibility,
    updateLayer,
    reorderLayer,
    moveObjectToLayerAt,
    reorderObjectInLayerAt,
    persistObject,
    patchObject,
    appendObjectImages,
    removeObjectImage,
    withObjectImageLock,
    removeObjectLocally,
    deleteObject,
    importData,
    replaceAll
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
