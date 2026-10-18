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
  loadUserData: vi.fn().mockResolvedValue({ layers: null, objects: [] }),
  saveLayers: vi.fn(),
  saveObjectsBatch: vi.fn(),
}));
vi.mock('../src/utils/firebase', () => ({
  saveObject: mockFb.saveObject,
  deleteObject: mockFb.deleteObject,
  deleteMapImage: mockFb.deleteMapImage,
  uploadMapImage: mockFb.uploadMapImage,
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

vi.mock('../src/hooks/use-workspace', () => ({ useWorkspace: () => workspaceState }));

const sessionState = vi.hoisted(() => ({
  drawingMode: 'none',
  setMode: vi.fn(),
  selectedObjectId: null as string | null,
  setSelectedObjectId: vi.fn(),
  selectObject: vi.fn(),
  flyToTarget: null,
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

    expect(mockFb.deleteMapImage).toHaveBeenCalledWith(uploadedImage.storagePath);
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

    expect(mockFb.deleteMapImage).toHaveBeenCalledWith(ownedImage.storagePath);
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

describe('storage.rules', () => {
  it('limits image writes to the user mapImages path', async () => {
    const rules = await import('fs').then((fs) =>
      fs.readFileSync('storage.rules', 'utf8'),
    );

    expect(rules).toMatch(/users\/\{userId\}\/mapImages\/\{objectId\}\/\{fileName\}/);
    expect(rules).toMatch(/request\.auth\.uid == userId/);
    expect(rules).toMatch(/request\.resource\.contentType\.matches\('image\/\.\*'\)/);
    expect(rules).toMatch(/request\.resource\.size <= 10 \* 1024 \* 1024/);
  });
});