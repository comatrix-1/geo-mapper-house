export interface PendingImageCleanup {
  uid: string;
  bucket: string;
  storagePath: string;
  fileName: string;
}

const STORAGE_KEY = 'geo-mapper:pending-image-cleanups';

const readQueue = (): PendingImageCleanup[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  const parsed: unknown = JSON.parse(raw);
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (item) =>
        !item ||
        typeof item.uid !== 'string' ||
        typeof item.bucket !== 'string' ||
        typeof item.storagePath !== 'string' ||
        typeof item.fileName !== 'string',
    )
  ) {
    throw new Error('Pending image cleanup queue is invalid.');
  }
  return parsed as PendingImageCleanup[];
};

const writeQueue = (queue: PendingImageCleanup[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
};

const cleanupKey = (item: PendingImageCleanup) =>
  `${item.uid}\u0000${item.bucket}\u0000${item.storagePath}`;

export const enqueueImageCleanup = (items: PendingImageCleanup[]) => {
  if (items.length === 0) return;

  const queue = readQueue();
  for (const item of items) {
    if (
      !queue.some(
        (pending) =>
          pending.uid === item.uid &&
          pending.bucket === item.bucket &&
          pending.storagePath === item.storagePath,
      )
    ) {
      queue.push(item);
    }
  }
  writeQueue(queue);
};

export const retryImageCleanup = async (
  uid: string,
  deleteImage: (bucket: string, storagePath: string) => Promise<void>,
): Promise<string[]> => {
  const queue = readQueue();
  const processed = new Map<string, boolean>();
  const failed: string[] = [];

  for (const item of queue) {
    if (item.uid !== uid) continue;
    try {
      await deleteImage(item.bucket, item.storagePath);
      processed.set(cleanupKey(item), true);
    } catch (error) {
      console.error('Failed to retry image cleanup:', error);
      processed.set(cleanupKey(item), false);
      failed.push(item.fileName);
    }
  }

  const pending = readQueue().filter(
    (item) => item.uid !== uid || processed.get(cleanupKey(item)) !== true,
  );
  writeQueue(pending);
  return failed;
};
