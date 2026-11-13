import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  loadUserData: vi.fn(),
  saveLayers: vi.fn(),
  saveObject: vi.fn(),
  deleteObject: vi.fn(),
  appendObjectImages: vi.fn(),
  removeObjectImage: vi.fn(),
  saveObjectsBatch: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock('../../src/utils/firebase', () => persistence);

import { useWorkspace } from '../../src/hooks/use-workspace';

const originalImage = {
  id: 'existing',
  imageUrl: 'https://download.example/existing.png',
  fileName: 'existing.png',
};
const object = {
  id: 'object-1',
  layerId: 'layer-1',
  type: 'point' as const,
  title: 'Point',
  description: '',
  position: { lat: 1, lng: 2 },
  images: [originalImage],
};
const uploadedImage = {
  id: 'new',
  imageUrl: 'https://download.example/new.png',
  fileName: 'new.png',
  storagePath: 'users/u1/objectImages/object-1/new/new.png',
  storageOwnerId: 'u1',
};

describe('useWorkspace attachment persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.loadUserData.mockResolvedValue({ layers: [], objects: [object] });
    persistence.saveObject.mockResolvedValue(undefined);
    persistence.deleteObject.mockResolvedValue(undefined);
    persistence.appendObjectImages.mockResolvedValue(undefined);
    persistence.removeObjectImage.mockResolvedValue(true);
    persistence.getObject.mockResolvedValue(object);
  });

  it('rolls back only newly appended images when the stored object is missing', async () => {
    persistence.appendObjectImages.mockRejectedValue({ code: 'not-found' });
    const { result } = renderHook(() => useWorkspace('u1'));
    await waitFor(() => expect(result.current.objects).toHaveLength(1));

    await act(async () => {
      await expect(result.current.appendObjectImages('object-1', [uploadedImage])).resolves.toEqual({
        status: 'missing',
      });
    });

    expect(result.current.objects[0].images).toEqual([originalImage]);
  });

  it('preserves a pre-existing image when a failed append reuses its id with a different file', async () => {
    persistence.appendObjectImages.mockRejectedValue({ code: 'not-found' });
    const conflictingUpload = {
      ...uploadedImage,
      id: originalImage.id,
      storagePath: 'users/u1/objectImages/object-1/existing/replacement.png',
    };
    const { result } = renderHook(() => useWorkspace('u1'));
    await waitFor(() => expect(result.current.objects).toHaveLength(1));

    await act(async () => {
      await result.current.appendObjectImages('object-1', [conflictingUpload]);
    });

    expect(result.current.objects[0].images).toEqual([originalImage]);
  });

  it('waits for an in-flight append before supplying the object to deletion', async () => {
    let finishAppend!: () => void;
    persistence.appendObjectImages.mockImplementation(
      () => new Promise<void>((resolve) => { finishAppend = resolve; }),
    );
    const { result } = renderHook(() => useWorkspace('u1'));
    await waitFor(() => expect(result.current.objects).toHaveLength(1));
    let deletionImages: unknown;

    let append!: Promise<unknown>;
    let deletion!: Promise<unknown>;
    act(() => {
      append = result.current.appendObjectImages('object-1', [uploadedImage]);
      deletion = result.current.withObjectImageLock('object-1', async (current) => {
        deletionImages = current?.images;
      });
    });

    await waitFor(() => expect(finishAppend).toBeDefined());
    expect(deletionImages).toBeUndefined();
    finishAppend();
    await act(async () => {
      await append;
      await deletion;
    });

    expect(deletionImages).toEqual([originalImage, uploadedImage]);
  });

  it('serializes workspace deletion after any active image append', async () => {
    let finishAppend!: () => void;
    persistence.appendObjectImages.mockImplementation(
      () => new Promise<void>((resolve) => { finishAppend = resolve; }),
    );
    const { result } = renderHook(() => useWorkspace('u1'));
    await waitFor(() => expect(result.current.objects).toHaveLength(1));

    let append!: Promise<unknown>;
    let deletion!: Promise<unknown>;
    act(() => {
      append = result.current.appendObjectImages('object-1', [uploadedImage]);
      deletion = result.current.deleteObject('object-1');
    });

    await waitFor(() => expect(finishAppend).toBeDefined());
    expect(persistence.deleteObject).not.toHaveBeenCalled();
    finishAppend();
    await act(async () => {
      await append;
      await deletion;
    });

    expect(persistence.deleteObject).toHaveBeenCalledWith('u1', 'object-1');
    expect(result.current.objects).toEqual([]);
  });

  it('keeps the local image when attachment removal persistence fails', async () => {
    persistence.removeObjectImage.mockRejectedValue(new Error('Firestore unavailable'));
    const { result } = renderHook(() => useWorkspace('u1'));
    await waitFor(() => expect(result.current.objects).toHaveLength(1));

    await act(async () => {
      await expect(result.current.removeObjectImage('object-1', 'existing')).rejects.toThrow(
        'Firestore unavailable',
      );
    });

    expect(result.current.objects[0].images).toEqual([originalImage]);
  });

  it('preserves the latest local images when a stale object snapshot is patched', async () => {
    const { result } = renderHook(() => useWorkspace('u1'));
    await waitFor(() => expect(result.current.objects).toHaveLength(1));
    await act(async () => {
      await result.current.appendObjectImages('object-1', [uploadedImage]);
    });

    act(() => {
      result.current.patchObject('object-1', {
        images: [originalImage],
        description: 'Updated description',
      });
    });

    expect(result.current.objects[0].description).toBe('Updated description');
    expect(result.current.objects[0].images).toEqual([originalImage, uploadedImage]);
  });

  it('reconciles failed appends to stored references and reports which uploads were confirmed', async () => {
    const persistedImage = { ...uploadedImage, id: 'new' };
    persistence.appendObjectImages.mockRejectedValue(new Error('Firestore unavailable'));
    persistence.getObject.mockResolvedValue({ ...object, images: [originalImage, persistedImage] });
    const { result } = renderHook(() => useWorkspace('u1'));
    await waitFor(() => expect(result.current.objects).toHaveLength(1));

    let appendResult: unknown;
    await act(async () => {
      appendResult = await result.current.appendObjectImages('object-1', [
        uploadedImage,
        { ...uploadedImage, id: 'orphan', storagePath: 'users/u1/objectImages/object-1/orphan.png' },
      ]);
    });

    expect(appendResult).toEqual({
      status: 'failed',
      error: expect.any(Error),
      confirmedImages: [persistedImage],
    });
    expect(result.current.objects[0].images).toEqual([originalImage, persistedImage]);
  });
});
