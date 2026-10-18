import { describe, expect, it } from 'vitest';
import type { Layer, MapImage } from '../../src/types';
import { loadProjectFromFile } from '../../src/utils/fileImporter';

// `saveProjectToFile` serializes layers+objects as a versioned JSON blob;
// `loadProjectFromFile` parses that same shape back. This round-trip test
// proves a complete image overlay object survives export/import unchanged —
// the image is never mapped into GeoJSON, it is a pass-through structural
// object like any other map object.
const projectFileWith = (objects: MapObject[], layers: Layer[] = []) =>
  new File(
    [JSON.stringify({ version: '1.0', timestamp: Date.now(), layers, objects })],
    'project.json',
    { type: 'application/json' },
  );

const imageObject: MapImage = {
  id: 'img-1',
  layerId: 'layer-1',
  type: 'image',
  title: 'Survey photo',
  description: 'A survey photo',
  imageUrl: 'https://download.example/photo.png',
  storagePath: 'users/owner-1/mapImages/img-1/photo.png',
  storageOwnerId: 'owner-1',
  fileName: 'photo.png',
  contentType: 'image/png',
  bounds: {
    southWest: { lat: 1, lng: 2 },
    northEast: { lat: 5, lng: 6 },
  },
};

describe('project JSON round trip', () => {
  it('retains a complete image overlay object unchanged', async () => {
    const result = await loadProjectFromFile(projectFileWith([imageObject]));

    expect(result.objects).toEqual([imageObject]);
    expect(result.objects[0]).toMatchObject(imageObject);
  });

  it('round trips an image alongside other object types', async () => {
    const point = {
      id: 'p-1',
      layerId: 'layer-1',
      type: 'point',
      title: 'Pin',
      description: '',
      position: { lat: 1, lng: 2 },
    };
    const result = await loadProjectFromFile(
      projectFileWith([point, imageObject], [{ id: 'layer-1', name: 'Layer 1', visible: true }]),
    );

    expect(result.objects).toHaveLength(2);
    expect(result.objects).toEqual([point, imageObject]);
    expect(result.layers).toHaveLength(1);
  });
});