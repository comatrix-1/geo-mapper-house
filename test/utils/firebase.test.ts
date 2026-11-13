import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firebase remains the auth/firestore backend; only image storage moved to
// Supabase. The firebase/storage mock is retained so the module still loads
// cleanly in tests, but the storage helpers under test now delegate to it.
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: class {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getFirestore: vi.fn(() => ({})),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => 'mock-storage'),
  ref: vi.fn(() => 'mock-ref'),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));

const supabaseStorage = vi.hoisted(() => ({
  upload: vi.fn().mockResolvedValue({ data: { path: '' }, error: null }),
  getPublicUrl: vi.fn().mockReturnValue({
    data: { publicUrl: 'https://download.example/image.png' },
    error: null,
  }),
  remove: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => supabaseStorage },
  }),
}));

// Import the module under test (after mocks are in place). The storage helpers
// are re-exported from firebase.ts for call-site stability; they delegate to
// the Supabase client mocked above.
import {
  uploadMapImage,
  deleteMapImage,
  buildObjectImageStoragePath,
  saveObject,
  loadUserData,
} from '../../src/utils/firebase';
import type { MapImage } from '../../src/types';
import { doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const pngFile = new File(['x'], 'map.png', { type: 'image/png' });
const storagePath = 'users/u1/mapImages/o1/map.png';

describe('Supabase Storage helpers (re-exported from firebase.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks strips default implementations, so re-establish them.
    supabaseStorage.upload.mockResolvedValue({ data: { path: '' }, error: null });
    supabaseStorage.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://download.example/image.png' },
      error: null,
    });
    supabaseStorage.remove.mockResolvedValue({ data: null, error: null });
  });

  it('uploads an image and returns the public download URL plus storage path', async () => {
    await expect(uploadMapImage('map-images', storagePath, pngFile)).resolves.toEqual({
      imageUrl: 'https://download.example/image.png',
      storagePath,
    });

    expect(supabaseStorage.upload).toHaveBeenCalledWith(storagePath, pngFile, {
      contentType: 'image/png',
      upsert: true,
    });
  });

  it('deletes an image from storage', async () => {
    await deleteMapImage('map-images', storagePath);
    expect(supabaseStorage.remove).toHaveBeenCalledWith([storagePath]);
  });

  it('builds object-image attachment paths under the objectImages prefix', () => {
    expect(buildObjectImageStoragePath('u1', 'obj-1', 'img-1', 'photo.png')).toBe(
      'users/u1/objectImages/obj-1/img-1/photo.png',
    );
  });

  it('sanitizes attachment filenames the same way as overlay paths', () => {
    expect(buildObjectImageStoragePath('u1', 'obj-1', 'img-2', 'a/b photo.png')).toBe(
      'users/u1/objectImages/obj-1/img-2/a_b photo.png',
    );
  });
});

const imageWithOpacity: MapImage = {
  id: 'img-1',
  layerId: 'layer-1',
  type: 'image',
  title: 'Survey photo',
  description: '',
  imageUrl: 'https://download.example/photo.png',
  fileName: 'photo.png',
  contentType: 'image/png',
  bounds: {
    southWest: { lat: 1, lng: 2 },
    northEast: { lat: 5, lng: 6 },
  },
  opacity: 0.4,
};

const legacyImage: MapImage = {
  id: 'img-legacy',
  layerId: 'layer-1',
  type: 'image',
  title: 'Legacy photo',
  description: '',
  imageUrl: 'https://download.example/legacy.png',
  fileName: 'legacy.png',
  contentType: 'image/png',
  bounds: {
    southWest: { lat: 0, lng: 0 },
    northEast: { lat: 4, lng: 4 },
  },
};

describe('image opacity persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(doc).mockReturnValue('mock-doc-ref' as never);
    vi.mocked(setDoc).mockResolvedValue(undefined as never);
  });

  it('saves an image with its opacity', async () => {
    await saveObject('u1', imageWithOpacity);

    expect(setDoc).toHaveBeenCalledWith('mock-doc-ref', imageWithOpacity);
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'img-1', opacity: 0.4 }),
    );
  });

  it('restores a saved image at its saved opacity', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    } as never);
    vi.mocked(getDocs).mockResolvedValue({
      docs: [{ data: () => imageWithOpacity }],
    } as never);

    const { objects } = await loadUserData('u1');

    expect(objects).toEqual([imageWithOpacity]);
    expect(objects[0]).toMatchObject({ opacity: 0.4 });
  });

  it('loads a legacy image without opacity unchanged, leaving the full-opacity fallback to the renderer', async () => {
    expect(legacyImage).not.toHaveProperty('opacity');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    } as never);
    vi.mocked(getDocs).mockResolvedValue({
      docs: [{ data: () => legacyImage }],
    } as never);

    const { objects } = await loadUserData('u1');

    expect(objects).toEqual([legacyImage]);
    expect(objects[0]).not.toHaveProperty('opacity');
  });
});