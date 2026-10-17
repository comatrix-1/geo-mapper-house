import { describe, it, expect } from 'vitest';
import {
  reorderLayers,
  moveObjectToLayer,
  reorderObjectInLayer,
  displayedObjectIds,
  reconcileObjectOrder,
  toLayerId,
  toObjectId,
  toDragCommand,
  applyDragCommand,
  layerZoneId,
} from '../../src/utils/dragDropState';
import type { Layer, MapPoint } from '../../src/types';

const makeLayer = (id: string, name = id, objectOrder?: string[]): Layer => ({
  id,
  name,
  visible: true,
  style: { borderColor: '#000', borderWidth: 2, fillColor: '#000', fillOpacity: 0.2 },
  objectOrder,
});

const makePoint = (id: string, layerId: string, title = id): import('../../src/types').MapObject => {
  const point: MapPoint = {
    id,
    layerId,
    type: 'point',
    title,
    description: '',
    position: { lat: 0, lng: 0 },
  };
  return point;
};

describe('reorderLayers', () => {
  const layers = [makeLayer('a'), makeLayer('b'), makeLayer('c')];

  it('moves a layer from an earlier index to a later index', () => {
    expect(reorderLayers(layers, 'a', 'c').map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });

  it('moves a layer from a later index to an earlier index', () => {
    expect(reorderLayers(layers, 'c', 'a').map((l) => l.id)).toEqual(['c', 'a', 'b']);
  });

  it('dropping a layer back onto itself returns the original array', () => {
    expect(reorderLayers(layers, 'b', 'b')).toBe(layers);
  });

  it('returns the original array when the dragged id does not exist', () => {
    expect(reorderLayers(layers, 'nope', 'a')).toBe(layers);
  });

  it('returns the original array when the target id does not exist', () => {
    expect(reorderLayers(layers, 'a', 'nope')).toBe(layers);
  });
});

describe('moveObjectToLayer', () => {
  const objects = [makePoint('p1', 'l1', 'Point One'), makePoint('p2', 'l2', 'Point Two')];

  it('reparents the dragged object onto the target layer', () => {
    const next = moveObjectToLayer(objects, 'p1', 'l2');
    expect(next.find((o) => o.id === 'p1')!.layerId).toBe('l2');
  });

  it('preserves the moved object identity as a new object (immutability)', () => {
    const moved = objects[0];
    const next = moveObjectToLayer(objects, 'p1', 'l2');
    expect(next[0]).not.toBe(moved);
    expect(next[0].id).toBe('p1');
    expect(next[0].type).toBe('point');
    expect(next[0].title).toBe('Point One');
  });

  it('does not mutate or alias untouched objects', () => {
    const next = moveObjectToLayer(objects, 'p1', 'l2');
    expect(next[1]).toBe(objects[1]);
  });

  it('is a no-op when the object is already in the target layer', () => {
    expect(moveObjectToLayer(objects, 'p1', 'l1')).toBe(objects);
  });

  it('returns the original array when the object id does not exist', () => {
    expect(moveObjectToLayer(objects, 'nope', 'l2')).toBe(objects);
  });
});

describe('reorderObjectInLayer', () => {
  const order = ['p1', 'p2', 'p3'];

  it('moves an id from an earlier index to a later index', () => {
    expect(reorderObjectInLayer(order, 'p1', 2)).toEqual(['p2', 'p3', 'p1']);
  });

  it('moves an id from a later index to an earlier index', () => {
    expect(reorderObjectInLayer(order, 'p3', 0)).toEqual(['p3', 'p1', 'p2']);
  });

  it('returns the original list when the id is already at the target index', () => {
    expect(reorderObjectInLayer(order, 'p2', 1)).toBe(order);
  });

  it('returns the original list when the id is absent', () => {
    expect(reorderObjectInLayer(order, 'nope', 0)).toBe(order);
  });

  it('clamps an out-of-range target index to the last position', () => {
    expect(reorderObjectInLayer(order, 'p1', 99)).toEqual(['p2', 'p3', 'p1']);
  });
});

describe('displayedObjectIds', () => {
  const l1 = makeLayer('l1', 'L1', ['p2', 'p1']);
  const objects = [makePoint('p1', 'l1'), makePoint('p2', 'l1'), makePoint('p3', 'l1')];

  it('returns members in objectOrder, then unordered members appended', () => {
    expect(displayedObjectIds(l1, objects)).toEqual(['p2', 'p1', 'p3']);
  });

  it('returns natural member order when the layer has no objectOrder', () => {
    const noOrder = makeLayer('l1');
    expect(displayedObjectIds(noOrder, objects)).toEqual(['p1', 'p2', 'p3']);
  });

  it('drops stale ids that no longer belong to the layer', () => {
    const stale = makeLayer('l1', 'L1', ['p9', 'p1']);
    expect(displayedObjectIds(stale, objects)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('reconcileObjectOrder', () => {
  const objects = [makePoint('p1', 'l1'), makePoint('p2', 'l1')];

  it('returns undefined when the stored order already matches members', () => {
    expect(reconcileObjectOrder('l1', ['p2', 'p1'], objects)).toBeUndefined();
  });

  it('returns a healed list when members changed', () => {
    expect(reconcileObjectOrder('l1', ['p1', 'deleted', 'p3'], objects)).toEqual(['p1', 'p2']);
  });

  it('returns natural order for an undefined stored order', () => {
    expect(reconcileObjectOrder('l1', undefined, objects)).toEqual(['p1', 'p2']);
  });

  it('returns undefined for empty layers with empty order lists', () => {
    expect(reconcileObjectOrder('l1', [], [])).toBeUndefined();
  });
});

describe('id helpers', () => {
  it('strips the layer prefix', () => {
    expect(toLayerId('layer:l1')).toBe('l1');
    expect(toLayerId('l1')).toBe('l1');
  });

  it('strips the object prefix', () => {
    expect(toObjectId('object:p1')).toBe('p1');
    expect(toObjectId('p1')).toBe('p1');
  });

  it('builds zone ids', () => {
    expect(layerZoneId('l1')).toBe('zone:l1');
  });
});

describe('toDragCommand', () => {
  const layers = [makeLayer('l1'), makeLayer('l2')];
  const objects = [
    makePoint('p1', 'l1'),
    makePoint('p2', 'l1'),
    makePoint('p3', 'l2'),
  ];

  it('maps a layer drop onto a different layer row to a reorder command', () => {
    expect(toDragCommand('layer:l1', 'layer:l2', objects, layers)).toEqual({
      type: 'reorder',
      draggedLayerId: 'l1',
      targetLayerId: 'l2',
    });
  });

  it('maps a layer drop back onto itself to a no-op command', () => {
    expect(toDragCommand('layer:l1', 'layer:l1', objects, layers)).toEqual({ type: 'none' });
  });

  it('maps an object drop onto a layer row to a cross-layer move (append)', () => {
    expect(toDragCommand('object:p1', 'layer:l2', objects, layers)).toEqual({
      type: 'moveObject',
      objectId: 'p1',
      targetLayerId: 'l2',
    });
  });

  it('maps an object drop onto a body zone to a cross-layer move (append)', () => {
    expect(toDragCommand('object:p1', 'zone:l2', objects, layers)).toEqual({
      type: 'moveObject',
      objectId: 'p1',
      targetLayerId: 'l2',
    });
  });

  it('maps an object drop onto a same-layer object row to a within-layer reorder', () => {
    expect(toDragCommand('object:p1', 'object:p2', objects, layers)).toEqual({
      type: 'reorderObject',
      objectId: 'p1',
      targetIndex: 1,
    });
  });

  it('maps an object drop onto a cross-layer object row to an indexed move', () => {
    expect(toDragCommand('object:p1', 'object:p3', objects, layers)).toEqual({
      type: 'moveObjectAtIndex',
      objectId: 'p1',
      targetLayerId: 'l2',
      targetIndex: 0,
    });
  });

  it('maps unknown kinds to a no-op command', () => {
    expect(toDragCommand('weird:x', 'weird:y', objects, layers)).toEqual({ type: 'none' });
  });

  it('maps an object drop onto a missing object to a no-op command', () => {
    expect(toDragCommand('object:p1', 'object:ghost', objects, layers)).toEqual({ type: 'none' });
  });
});

describe('applyDragCommand', () => {
  const layers = [makeLayer('l1', 'L1', ['p1', 'p2']), makeLayer('l2', 'L2')];
  const objects = [makePoint('p1', 'l1'), makePoint('p2', 'l1'), makePoint('p3', 'l2')];

  it('no-op command returns the original state untouched', () => {
    const result = applyDragCommand({ layers, objects }, { type: 'none' });
    expect(result.layers).toBe(layers);
    expect(result.objects).toBe(objects);
    expect(result.changedLayers).toEqual([]);
    expect(result.movedObject).toBeNull();
  });

  it('reorder command moves the dragged layer to the target position', () => {
    const result = applyDragCommand(
      { layers, objects },
      { type: 'reorder', draggedLayerId: 'l1', targetLayerId: 'l2' }
    );
    expect(result.layers.map((l) => l.id)).toEqual(['l2', 'l1']);
    expect(result.changedLayers).toEqual([]);
    expect(result.movedObject).toBeNull();
  });

  it('reorderObject splices the moved id within its layer order', () => {
    const result = applyDragCommand(
      { layers, objects },
      { type: 'reorderObject', objectId: 'p1', targetIndex: 1 }
    );
    const l1 = result.layers.find((l) => l.id === 'l1')!;
    expect(l1.objectOrder).toEqual(['p2', 'p1']);
    expect(result.changedLayers).toHaveLength(1);
    expect(result.changedLayers[0].id).toBe('l1');
    expect(result.movedObject).toBeNull();
  });

  it('moveObject removes the id from the source order and appends to the target', () => {
    const result = applyDragCommand(
      { layers, objects },
      { type: 'moveObject', objectId: 'p1', targetLayerId: 'l2' }
    );
    expect(result.objects.find((o) => o.id === 'p1')!.layerId).toBe('l2');
    expect(result.layers.find((l) => l.id === 'l1')!.objectOrder).toEqual(['p2']);
    expect(result.layers.find((l) => l.id === 'l2')!.objectOrder).toEqual(['p3', 'p1']);
    expect(result.changedLayers).toHaveLength(2);
    expect(result.movedObject).toEqual({ ...objects[0], layerId: 'l2' });
  });

  it('moveObjectAtIndex inserts at the requested position in the target order', () => {
    const withOrder = [
      makeLayer('l1', 'L1', ['p1', 'p2']),
      makeLayer('l2', 'L2', ['p3']),
    ];
    const result = applyDragCommand(
      { layers: withOrder, objects },
      { type: 'moveObjectAtIndex', objectId: 'p1', targetLayerId: 'l2', targetIndex: 0 }
    );
    expect(result.layers.find((l) => l.id === 'l2')!.objectOrder).toEqual(['p1', 'p3']);
    expect(result.movedObject!.layerId).toBe('l2');
  });

  it('cross-layer move onto the object\'s own layer is a no-op', () => {
    const result = applyDragCommand(
      { layers, objects },
      { type: 'moveObject', objectId: 'p1', targetLayerId: 'l1' }
    );
    expect(result.layers).toBe(layers);
    expect(result.objects).toBe(objects);
    expect(result.changedLayers).toEqual([]);
    expect(result.movedObject).toBeNull();
  });

  it('reorderObject heals a stale order before splicing', () => {
    const staleLayers = [
      makeLayer('l1', 'L1', ['p1', 'ghost', 'p2']),
      makeLayer('l2', 'L2'),
    ];
    const result = applyDragCommand(
      { layers: staleLayers, objects },
      { type: 'reorderObject', objectId: 'p1', targetIndex: 1 }
    );
    const l1 = result.layers.find((l) => l.id === 'l1')!;
    expect(l1.objectOrder).toEqual(['p2', 'p1']);
  });
});
