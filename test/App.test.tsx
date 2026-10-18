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

vi.mock('../../src/hooks/use-workspace', () => ({ useWorkspace: () => workspaceState }));

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
// upload flow can compute viewport-relative bounds from a live map.
vi.mock('../src/components/MapBoard', async () => {
  const React = await import('react');
  const MockMapBoard = ({
    onMapReady,
  }: {
    onMapReady?: (m: {
      getCenter: () => { lat: number; lng: number };
      getZoom: () => number;
      getSize: () => { x: number; y: number };
    }) => void;
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
    return React.createElement('div', { 'data-testid': 'map-board' });
  };
  return { default: MockMapBoard };
});

vi.mock('../../src/components/LayerSidebar', () => ({ default: () => React.createElement('div') }));
vi.mock('../../src/components/AuthWidget', () => ({ default: () => React.createElement('div') }));
vi.mock('../../src/components/MapHintBanner', () => ({ default: () => React.createElement('div') }));

import App from '../src/App';

const pngFile = new File(['x'], 'map.png', { type: 'image/png' });
const uploadedImage = {
  imageUrl: 'https://download.example/image.png',
  storagePath: 'users/u1/mapImages/o1/map.png',
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.setters.length = 0;
  mockImg.validateImageFile.mockReturnValue(null);
  mockImg.getImageDimensions.mockResolvedValue({ width: 800, height: 600 });
  mockImg.createImageBounds.mockReturnValue({ southWest: { lat: 1, lng: 1 }, northEast: { lat: 5, lng: 5 } });
  mockFb.uploadMapImage.mockResolvedValue(uploadedImage);
  mockFb.loadUserData.mockResolvedValue({ layers: workspaceState.layers, objects: [] });
  workspaceState.objects = [];
});

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