import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auth user: a mutable, re-renderable mock. `setUser` updates the shared
// value and pokes every mounted `useAuthUser` instance's React setter so the
// app re-renders with the new session — mirroring `onAuthStateChanged`.
const authState = vi.hoisted(() => {
  const setters: Array<(u: { uid: string } | null) => void> = [];
  return {
    setters,
    setUser: (uid: string | null) => {
      const user = uid ? { uid } : null;
      setters.forEach((set) => set(user));
    },
  };
});

vi.mock('../src/hooks/use-auth-user', async () => {
  const React = await import('react');
  return {
    useAuthUser: () => {
      const [user, setUser] = React.useState<{ uid: string } | null>(null);
      React.useEffect(() => {
        authState.setters.push(setUser);
        return () => {
          const i = authState.setters.indexOf(setUser);
          if (i >= 0) authState.setters.splice(i, 1);
        };
      }, []);
      return user;
    },
  };
});

const mockFb = vi.hoisted(() => ({
  saveObject: vi.fn(),
  deleteObject: vi.fn(),
  deleteMapImage: vi.fn(),
  uploadMapImage: vi.fn(),
  buildMapImageStoragePath: (uid: string, objectId: string, fileName: string) =>
    `users/${uid}/mapImages/${objectId}/${fileName}`,
  buildObjectImageStoragePath: (
    uid: string,
    objectId: string,
    imageId: string,
    fileName: string,
  ) => `users/${uid}/objectImages/${objectId}/${imageId}/${fileName}`,
  MAP_IMAGES_BUCKET: 'map-images',
  loadUserData: vi.fn().mockResolvedValue({ layers: null, objects: [] }),
  saveLayers: vi.fn(),
  saveObjectsBatch: vi.fn(),
}));
vi.mock('../src/utils/firebase', () => ({
  saveObject: mockFb.saveObject,
  deleteObject: mockFb.deleteObject,
  deleteMapImage: mockFb.deleteMapImage,
  uploadMapImage: mockFb.uploadMapImage,
  buildMapImageStoragePath: mockFb.buildMapImageStoragePath,
  buildObjectImageStoragePath: mockFb.buildObjectImageStoragePath,
  MAP_IMAGES_BUCKET: mockFb.MAP_IMAGES_BUCKET,
  loadUserData: mockFb.loadUserData,
  saveLayers: mockFb.saveLayers,
  saveObjectsBatch: mockFb.saveObjectsBatch,
}));

const mockImg = vi.hoisted(() => ({
  validateImageFile: vi.fn(),
  getImageDimensions: vi.fn(),
  createImageBounds: vi.fn(),
}));
vi.mock('../src/utils/imageOverlay', () => ({
  validateImageFile: mockImg.validateImageFile,
  getImageDimensions: mockImg.getImageDimensions,
  createImageBounds: mockImg.createImageBounds,
}));

const workspaceState = vi.hoisted(() => ({
  layers: [
    {
      id: '1',
      name: 'Layer 1',
      visible: true,
      style: { borderColor: '#3b82f6', borderWidth: 2, fillColor: '#3b82f6', fillOpacity: 0.2 },
    },
  ],
  activeLayerId: '1',
  objects: [] as Record<string, unknown>[],
  setObjects: vi.fn(),
  deleteObject: vi.fn(),
  persistObject: vi.fn(),
  patchObject: vi.fn(),
  appendObjectImages: vi.fn(),
  removeObjectImage: vi.fn(),
  withObjectImageLock: vi.fn(),
  removeObjectLocally: vi.fn(),
  replaceAll: vi.fn(),
  importData: vi.fn(),
  addLayer: vi.fn(),
  deleteLayer: vi.fn(),
  toggleLayerVisibility: vi.fn(),
  updateLayer: vi.fn(),
  reorderLayer: vi.fn(),
  moveObjectToLayerAt: vi.fn(),
  reorderObjectInLayerAt: vi.fn(),
  setActiveLayerId: vi.fn(),
}));

const cleanupQueue = vi.hoisted(() => ({
  enqueueImageCleanup: vi.fn(),
  retryImageCleanup: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/utils/image-cleanup-queue', () => cleanupQueue);

vi.mock('../src/hooks/use-workspace', () => ({ useWorkspace: () => workspaceState }));

const sessionState = vi.hoisted(() => ({
  drawingMode: 'none',
  setMode: vi.fn(),
  selectedObjectId: null as string | null,
  setSelectedObjectId: vi.fn(),
  selectObject: vi.fn(),
  focusTarget: null,
  rulerPoints: [] as Record<string, unknown>[],
  setRulerPoints: vi.fn(),
}));
vi.mock('../../src/hooks/use-map-session', () => ({ useMapSession: () => sessionState }));

// MapBoard is mocked: it surfaces the map instance through onMapReady so the
// upload flow can compute viewport-relative bounds from a live map, and it
// renders image overlays from `objects` so deletion tests can assert on the
// on-screen image (alt text) before and after a delete attempt.
vi.mock('../src/components/MapBoard', async () => {
  const React = await import('react');
  const MockMapBoard = ({
    onMapReady,
    objects,
  }: {
    onMapReady?: (m: {
      getCenter: () => { lat: number; lng: number };
      getZoom: () => number;
      getSize: () => { x: number; y: number };
    }) => void;
    objects?: Array<Record<string, unknown>>;
  }) => {
    React.useEffect(() => {
      if (onMapReady) {
        onMapReady({
          getCenter: () => ({ lat: 1.3, lng: 103.8 }),
          getZoom: () => 13,
          getSize: () => ({ x: 1000, y: 600 }),
        });
      }
    }, [onMapReady]);
    return React.createElement(
      'div',
      { 'data-testid': 'map-board' },
      (objects ?? []).map((obj: Record<string, unknown>) =>
        obj.type === 'image'
          ? React.createElement('img', {
              key: String(obj.id),
              alt: String(obj.title),
              src: String(obj.imageUrl),
            })
          : null,
      ),
    );
  };
  return { default: MockMapBoard };
});

// LayerSidebar is real here: its Properties panel renders ObjectDetailsPanel,
// whose "Delete Object" button is the only user-facing delete control and the
// one the deletion tests drive.
vi.mock('../../src/components/AuthWidget', () => ({ default: () => React.createElement('div') }));
vi.mock('../../src/components/MapHintBanner', () => ({ default: () => React.createElement('div') }));

import App from '../src/App';

const pngFile = new File(['x'], 'map.png', { type: 'image/png' });
const uploadedImage = {
  imageUrl: 'https://download.example/image.png',
  storagePath: 'users/u1/mapImages/o1/map.png',
};

const ownedImage = {
  id: 'img-owned',
  layerId: '1',
  type: 'image',
  title: 'Owned photo',
  description: '',
  imageUrl: 'https://download.example/owned.png',
  storagePath: 'users/u1/mapImages/img-owned/owned.png',
  storageOwnerId: 'u1',
  fileName: 'owned.png',
  contentType: 'image/png',
  bounds: { southWest: { lat: 1, lng: 1 }, northEast: { lat: 5, lng: 5 } },
};

const importedImage = {
  id: 'img-imported',
  layerId: '1',
  type: 'image',
  title: 'Imported photo',
  description: '',
  imageUrl: 'https://download.example/imported.png',
  storagePath: 'users/u2/mapImages/img-imported/imported.png',
  storageOwnerId: 'u2',
  fileName: 'imported.png',
  contentType: 'image/png',
  bounds: { southWest: { lat: 1, lng: 1 }, northEast: { lat: 5, lng: 5 } },
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.setters.length = 0;
  mockImg.validateImageFile.mockReturnValue(null);
  mockImg.getImageDimensions.mockResolvedValue({ width: 800, height: 600 });
  mockImg.createImageBounds.mockReturnValue({ southWest: { lat: 1, lng: 1 }, northEast: { lat: 5, lng: 5 } });
  mockFb.uploadMapImage.mockResolvedValue(uploadedImage);
  // The workspace ops that persist resolve as success by default; individual
  // tests override this to exercise the failure / concurrent-delete paths.
  workspaceState.removeObjectImage.mockResolvedValue(true);
  workspaceState.appendObjectImages.mockResolvedValue({ status: 'attached' });
  workspaceState.withObjectImageLock.mockImplementation(
    (_id: string, operation: (target: Record<string, unknown> | undefined) => unknown) =>
      Promise.resolve(operation(workspaceState.objects.find((obj) => obj.id === _id))),
  );
  cleanupQueue.retryImageCleanup.mockResolvedValue([]);
  // The workspace loads from Firestore on sign-in; mirror that by returning
  // whatever objects the test has pre-seeded into the shared state.
  mockFb.loadUserData.mockImplementation(() =>
    Promise.resolve({ layers: workspaceState.layers, objects: workspaceState.objects }),
  );
  workspaceState.objects = [];
});

/** Click an object row in the sidebar. The active layer's body is expanded by
 * default, so the row text is directly clickable. */
const selectObject = async (user: ReturnType<typeof userEvent.setup>, id: string) => {
  await user.click(screen.getByText(id === 'img-owned' ? 'Owned photo' : 'Imported photo'));
};

describe('App image upload flow', () => {
  it('requires sign-in before uploading an image', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText('Choose image file'), pngFile);

    expect(screen.getByRole('alert')).toHaveTextContent('Sign in is required to upload images.');
  });

  it('uploads an image and saves a MapImage object in the active layer', async () => {
    const user = userEvent.setup();
    render(<App />);

    authState.setUser('u1');

    await user.upload(screen.getByLabelText('Choose image file'), pngFile);

    expect(mockFb.saveObject).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: 'image',
        layerId: '1',
        imageUrl: uploadedImage.imageUrl,
        storageOwnerId: 'u1',
      }),
    );
  });

  it('cleans up the uploaded file when Firestore save fails', async () => {
    const user = userEvent.setup();
    render(<App />);

    authState.setUser('u1');
    mockFb.saveObject.mockRejectedValueOnce(new Error('Firestore unavailable'));

    await user.upload(screen.getByLabelText('Choose image file'), pngFile);

    expect(mockFb.deleteMapImage).toHaveBeenCalledWith('map-images', uploadedImage.storagePath);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save image overlay.');
  });
});

describe('App image deletion', () => {
  it('deletes owned image Storage file then Firestore object', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [ownedImage];
    render(<App />);

    authState.setUser('u1');
    await selectObject(user, 'img-owned');
    await user.click(screen.getByRole('button', { name: 'Delete Object' }));

    expect(mockFb.deleteMapImage).toHaveBeenCalledWith('map-images', ownedImage.storagePath);
    expect(mockFb.deleteObject).toHaveBeenCalledWith('u1', ownedImage.id);
  });

  it('never deletes another user Storage file when deleting an imported image', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [importedImage];
    render(<App />);

    authState.setUser('u1');
    await selectObject(user, 'img-imported');
    await user.click(screen.getByRole('button', { name: 'Delete Object' }));

    expect(mockFb.deleteMapImage).not.toHaveBeenCalled();
    expect(mockFb.deleteObject).toHaveBeenCalledWith('u1', importedImage.id);
  });

  it('retains the object and shows an error when Storage deletion is denied', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [ownedImage];
    render(<App />);

    authState.setUser('u1');
    mockFb.deleteMapImage.mockRejectedValueOnce(new Error('Storage denied'));
    await selectObject(user, 'img-owned');
    await user.click(screen.getByRole('button', { name: 'Delete Object' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Could not delete image file.');
    expect(screen.getByAltText(ownedImage.title)).toBeInTheDocument();
    expect(mockFb.deleteObject).not.toHaveBeenCalled();
  });
});

describe('supabase storage', () => {
  it('uses the map-images bucket for the user mapImages path', async () => {
    const supabase = await import('../src/utils/supabase');
    expect(supabase.MAP_IMAGES_BUCKET).toBe('map-images');
    expect(supabase.buildMapImageStoragePath('u1', 'o1', 'map.png')).toBe(
      'users/u1/mapImages/o1/map.png',
    );
  });

  it('builds object attachment paths under the objectImages prefix', async () => {
    const supabase = await import('../src/utils/supabase');
    expect(supabase.buildObjectImageStoragePath('u1', 'o1', 'i1', 'map.png')).toBe(
      'users/u1/objectImages/o1/i1/map.png',
    );
  });
});

// --- Image attachments on map objects -------------------------------------

const attachment1 = {
  id: 'att-1',
  imageUrl: 'https://download.example/a1.png',
  fileName: 'a1.png',
  storagePath: 'users/u1/objectImages/point-1/att-1/a1.png',
  storageOwnerId: 'u1',
};
const attachment2 = {
  id: 'att-2',
  imageUrl: 'https://download.example/a2.png',
  fileName: 'a2.png',
  storagePath: 'users/u2/objectImages/point-1/att-2/a2.png',
  storageOwnerId: 'u2',
};
const pointWithAttachments = {
  id: 'point-1',
  layerId: '1',
  type: 'point',
  title: 'Photo point',
  description: '',
  position: { lat: 1, lng: 2 },
  images: [attachment1, attachment2],
};

const goodFile = new File(['x'], 'good.png', { type: 'image/png' });
const badFile = new File(['x'], 'bad.txt', { type: 'text/plain' });

/** Select the point in the sidebar, then drive its hidden multi-file input. */
const attachFiles = async (
  user: ReturnType<typeof userEvent.setup>,
  files: File[],
) => {
  await user.click(screen.getByText('Photo point'));
  // Scoped to the panel's multi-file picker: the Toolbar's single-file input
  // shares the image/* accept but not the `multiple` attribute. user-event
  // takes the whole batch as one array argument.
  const input = document.querySelector(
    'input[type="file"][accept="image/*"][multiple]'
  ) as HTMLInputElement;
  await user.upload(input, files);
};

describe('App object image attachments', () => {
  it('rejects a batch with an invalid file before any upload', async () => {
    // user-event filters picked files by the input's accept attribute (like a
    // real file dialog); disable that so the invalid .txt actually reaches
    // the strict batch validation.
    const user = userEvent.setup({ applyAccept: false });
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');

    mockImg.validateImageFile.mockImplementation((file: File) =>
      file.name === 'bad.txt' ? 'Please choose an image file.' : null,
    );

    await attachFiles(user, [goodFile, badFile]);

    expect(mockFb.uploadMapImage).not.toHaveBeenCalled();
    expect(mockFb.saveObject).not.toHaveBeenCalled();
    expect(workspaceState.appendObjectImages).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('bad.txt');
  });

  it('attaches every file of a valid batch in a single object update', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');

    mockFb.uploadMapImage.mockImplementation(
      (_bucket: string, storagePath: string) =>
        Promise.resolve({
          imageUrl: `https://download.example/${storagePath}`,
          storagePath,
        }),
    );

    const fileA = new File(['a'], 'a.png', { type: 'image/png' });
    const fileB = new File(['b'], 'b.png', { type: 'image/png' });
    await attachFiles(user, [fileA, fileB]);

    expect(mockFb.uploadMapImage).toHaveBeenCalledTimes(2);
    expect(mockFb.uploadMapImage.mock.calls[0][1]).toMatch(
      /^users\/u1\/objectImages\/point-1\//,
    );
    // One workspace operation for the whole batch; the workspace merges into
    // the object's current attachment list, existing attachments kept.
    expect(workspaceState.appendObjectImages).toHaveBeenCalledTimes(1);
    expect(workspaceState.appendObjectImages).toHaveBeenCalledWith(
      'point-1',
      [
        expect.objectContaining({ fileName: 'a.png', storageOwnerId: 'u1' }),
        expect.objectContaining({ fileName: 'b.png', storageOwnerId: 'u1' }),
      ],
    );
  });

  it('attaches the successful uploads and toasts when some uploads fail', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');

    mockFb.uploadMapImage.mockImplementation(
      (_bucket: string, _storagePath: string, file: File) =>
        file.name === 'fail.png'
          ? Promise.reject(new Error('Storage down'))
          : Promise.resolve({
              imageUrl: 'https://download.example/ok.png',
              storagePath: 'users/u1/objectImages/point-1/ok/ok.png',
            }),
    );

    const okFile = new File(['o'], 'ok.png', { type: 'image/png' });
    const failFile = new File(['f'], 'fail.png', { type: 'image/png' });
    await attachFiles(user, [failFile, okFile]);

    // Successful attachments still land in one operation; the failure toasts.
    expect(workspaceState.appendObjectImages).toHaveBeenCalledTimes(1);
    expect(workspaceState.appendObjectImages.mock.calls[0][1]).toEqual([
      expect.objectContaining({ fileName: 'ok.png' }),
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent('fail.png');
  });

  it('cleans up the uploaded files when the object was deleted while uploads were in flight', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');
    // The stored object is gone by the time the batch finishes uploading.
    workspaceState.appendObjectImages.mockResolvedValue({ status: 'missing' });

    const file = new File(['a'], 'a.png', { type: 'image/png' });
    await attachFiles(user, [file]);

    // The merge never lands, so the freshly uploaded file is removed
    // instead of being left as an orphan in Storage.
    expect(mockFb.deleteMapImage).toHaveBeenCalledWith('map-images', uploadedImage.storagePath);
  });

  it('cleans unreferenced uploads and reports a persistence failure', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');
    workspaceState.appendObjectImages.mockResolvedValue({
      status: 'failed',
      error: new Error('Firestore unavailable'),
      confirmedImages: [],
    });

    await attachFiles(user, [new File(['a'], 'a.png', { type: 'image/png' })]);

    expect(mockFb.deleteMapImage).toHaveBeenCalledWith('map-images', uploadedImage.storagePath);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save image attachments.');
  });

  it('durably queues an uploaded file when orphan cleanup fails', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');
    workspaceState.appendObjectImages.mockResolvedValue({ status: 'missing' });
    mockFb.deleteMapImage.mockRejectedValueOnce(new Error('Storage unavailable'));

    await attachFiles(user, [new File(['a'], 'a.png', { type: 'image/png' })]);

    expect(cleanupQueue.enqueueImageCleanup).toHaveBeenCalledWith([
      {
        uid: 'u1',
        bucket: 'map-images',
        storagePath: uploadedImage.storagePath,
        fileName: 'a.png',
      },
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent('Cleanup will retry.');
  });

  it('removes an attachment even when its storage delete rejects', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');
    mockFb.deleteMapImage.mockRejectedValueOnce(new Error('Storage denied'));

    await user.click(screen.getByText('Photo point'));
    await user.click(screen.getByRole('button', { name: 'Remove image a1.png' }));

    // The removal stands; the failed cleanup of the owned file is surfaced.
    expect(workspaceState.removeObjectImage).toHaveBeenCalledWith('point-1', 'att-1');
    expect(mockFb.deleteMapImage).toHaveBeenCalledWith(
      'map-images',
      attachment1.storagePath,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not delete image file: a1.png. Cleanup will retry.',
    );
    expect(cleanupQueue.enqueueImageCleanup).toHaveBeenCalledWith([
      {
        uid: 'u1',
        bucket: 'map-images',
        storagePath: attachment1.storagePath,
        fileName: 'a1.png',
      },
    ]);
  });

  it('never deletes another owner\u2019s attachment file when removing it', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');

    await user.click(screen.getByText('Photo point'));
    await user.click(screen.getByRole('button', { name: 'Remove image a2.png' }));

    // The imported attachment belongs to u2: removal is Firestore-only.
    expect(mockFb.deleteMapImage).not.toHaveBeenCalled();
    // The workspace mock keeps the seeded objects, so the filter is computed
    // against them: only att-2 (the removed one) is dropped.
    expect(workspaceState.removeObjectImage).toHaveBeenCalledWith('point-1', 'att-2');
  });

  it('deletes owned attachment files, then the object', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');

    await user.click(screen.getByText('Photo point'));
    await user.click(screen.getByRole('button', { name: 'Delete Object' }));

    expect(mockFb.deleteMapImage).toHaveBeenCalledWith(
      'map-images',
      attachment1.storagePath,
    );
    // The imported attachment belongs to u2 and is never storage-deleted.
    expect(mockFb.deleteMapImage).not.toHaveBeenCalledWith(
      'map-images',
      attachment2.storagePath,
    );
    expect(mockFb.deleteObject).toHaveBeenCalledWith('u1', 'point-1');
    expect(workspaceState.removeObjectLocally).toHaveBeenCalledWith('point-1');
  });

  it('still deletes the object when attachment cleanup fails, surfacing the failure', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');
    mockFb.deleteMapImage.mockRejectedValue(new Error('Storage denied'));

    await user.click(screen.getByText('Photo point'));
    await user.click(screen.getByRole('button', { name: 'Delete Object' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not delete image file(s): a1.png. Cleanup will retry.'
    );
    expect(mockFb.deleteObject).toHaveBeenCalledWith('u1', 'point-1');
    expect(workspaceState.removeObjectLocally).toHaveBeenCalledWith('point-1');
    expect(cleanupQueue.enqueueImageCleanup).toHaveBeenCalledWith([
      {
        uid: 'u1',
        bucket: 'map-images',
        storagePath: attachment1.storagePath,
        fileName: 'a1.png',
      },
    ]);
  });

  it('does not delete an attachment file when its document removal fails', async () => {
    const user = userEvent.setup();
    workspaceState.objects = [pointWithAttachments];
    render(<App />);
    authState.setUser('u1');
    workspaceState.removeObjectImage.mockRejectedValue(new Error('Firestore unavailable'));

    await user.click(screen.getByText('Photo point'));
    await user.click(screen.getByRole('button', { name: 'Remove image a1.png' }));

    expect(mockFb.deleteMapImage).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not remove image: a1.png.');
  });
});