import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Import the module under test (after mocks are in place)
import { uploadMapImage, deleteMapImage } from '../../src/utils/firebase';
import { uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const pngFile = new File(['x'], 'map.png', { type: 'image/png' });

describe('Firebase Storage helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads an image and returns download URL plus storage path', async () => {
    vi.mocked(getDownloadURL).mockResolvedValue('https://download.example/image.png');

    await expect(uploadMapImage('u1', 'o1', pngFile)).resolves.toEqual({
      imageUrl: 'https://download.example/image.png',
      storagePath: 'users/u1/mapImages/o1/map.png',
    });
    expect(uploadBytes).toHaveBeenCalledWith(expect.anything(), pngFile, { contentType: 'image/png' });
  });

  it('deletes an image from storage', async () => {
    await deleteMapImage('users/u1/mapImages/o1/map.png');
    expect(deleteObject).toHaveBeenCalledWith(expect.anything());
  });
});
