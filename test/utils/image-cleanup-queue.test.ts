import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueImageCleanup, retryImageCleanup } from '../../src/utils/image-cleanup-queue';

const queued = {
  uid: 'u1',
  bucket: 'map-images',
  storagePath: 'users/u1/objectImages/object-1/image-1/photo.png',
  fileName: 'photo.png',
};

describe('durable image cleanup queue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retains failed paths durably and removes them after a later successful retry', async () => {
    enqueueImageCleanup([queued]);
    const rejectDelete = vi.fn().mockRejectedValue(new Error('Storage unavailable'));
    await expect(retryImageCleanup('u1', rejectDelete)).resolves.toEqual(['photo.png']);

    const succeedDelete = vi.fn().mockResolvedValue(undefined);
    await expect(retryImageCleanup('u1', succeedDelete)).resolves.toEqual([]);
    expect(succeedDelete).toHaveBeenCalledWith('map-images', queued.storagePath);
    await expect(retryImageCleanup('u1', succeedDelete)).resolves.toEqual([]);
    expect(succeedDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps another user’s cleanup paths queued when retrying the signed-in user', async () => {
    enqueueImageCleanup([queued, { ...queued, uid: 'u2' }]);
    const deleteImage = vi.fn().mockResolvedValue(undefined);

    await retryImageCleanup('u1', deleteImage);

    expect(deleteImage).toHaveBeenCalledTimes(1);
    await retryImageCleanup('u2', deleteImage);
    expect(deleteImage).toHaveBeenCalledTimes(2);
  });

  it('preserves cleanup paths enqueued while a retry is in flight', async () => {
    const laterItem = {
      ...queued,
      storagePath: 'users/u1/objectImages/object-1/image-2/second.png',
      fileName: 'second.png',
    };
    enqueueImageCleanup([queued]);
    let finishDelete!: () => void;
    const retry = retryImageCleanup(
      'u1',
      () => new Promise<void>((resolve) => { finishDelete = resolve; }),
    );
    await vi.waitFor(() => expect(finishDelete).toBeDefined());

    enqueueImageCleanup([laterItem]);
    finishDelete();
    await retry;

    const nextDelete = vi.fn().mockResolvedValue(undefined);
    await retryImageCleanup('u1', nextDelete);
    expect(nextDelete).toHaveBeenCalledWith('map-images', laterItem.storagePath);
  });
});
