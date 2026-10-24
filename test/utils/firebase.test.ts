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
import { uploadMapImage, deleteMapImage } from '../../src/utils/firebase';

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
});