import type { Layer, MapObject } from '../types';

/**
 * Pure workspace state transformations. Keeping them free of React and
 * Firebase makes them trivially unit-testable and lets new state operations
 * be added without touching the hook that owns the state (Open/Closed).
 */

/** Palette layers are colored from when created by the user. */
const LAYER_PALETTE: readonly string[] = ['#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];

/** Factory for a new user-created layer. */
export function createLayer(existingCount: number): Layer {
  const color = LAYER_PALETTE[Math.floor(Math.random() * LAYER_PALETTE.length)];
  return {
    id: crypto.randomUUID(),
    name: `Layer ${existingCount + 1}`,
    visible: true,
    style: {
      borderColor: color,
      borderWidth: 2,
      fillColor: color,
      fillOpacity: 0.2
    }
  };
}

/** Guarantees the active id references an existing layer ('' when none do). */
export function repairActiveLayerId(layers: Layer[], activeLayerId: string): string {
  return layers.some((l) => l.id === activeLayerId) ? activeLayerId : layers[0]?.id ?? '';
}

/** Whole-workspace snapshot operated on by the cascade helpers below. */
export interface WorkspaceSnapshot {
  layers: Layer[];
  objects: MapObject[];
  activeLayerId: string;
}

/** Removes a layer together with every object it contains. */
export function deleteLayerCascade(
  snapshot: WorkspaceSnapshot,
  layerId: string
): WorkspaceSnapshot {
  const layers = snapshot.layers.filter((l) => l.id !== layerId);
  const objects = snapshot.objects.filter((o) => o.layerId !== layerId);
  const activeLayerId =
    snapshot.activeLayerId === layerId
      ? repairActiveLayerId(layers, snapshot.activeLayerId)
      : snapshot.activeLayerId;
  return { layers, objects, activeLayerId };
}

/**
 * Regenerates every id in imported data so merging cannot collide with
 * existing layers/objects; objects are remapped through the new layer ids
 * (falling back to the original id, which only occurs in malformed files).
 */
export function assignFreshIds(
  layers: Layer[],
  objects: MapObject[]
): { layers: Layer[]; objects: MapObject[] } {
  const layerIdMap = new Map(layers.map((l) => [l.id, crypto.randomUUID()]));

  return {
    layers: layers.map((l) => ({ ...l, id: layerIdMap.get(l.id)! })),
    objects: objects.map((o) => ({
      ...o,
      id: crypto.randomUUID(),
      layerId: layerIdMap.get(o.layerId) ?? o.layerId
    }))
  };
}
