import { createClient } from '@supabase/supabase-js';

// Supabase is used only for object storage (map images). Firestore and Auth
// remain Firebase. Pass the Firebase ID token so Supabase Storage can enforce
// per-user RLS policies against the Firebase UID.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY.',
  );
}

let getFirebaseAccessToken: () => Promise<string | null> = async () => null;

/** Set by firebase.ts after Firebase Auth has been initialized. */
export const setFirebaseAccessTokenProvider = (
  provider: () => Promise<string | null>,
): void => {
  getFirebaseAccessToken = provider;
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  accessToken: () => getFirebaseAccessToken(),
});

export const MAP_IMAGES_BUCKET = 'map-images';

/** Path shape: users/<uid>/mapImages/<objectId>/<fileName> */
export const buildMapImageStoragePath = (
  uid: string,
  objectId: string,
  fileName: string,
): string => `users/${uid}/mapImages/${objectId}/${fileName.replace(/[\\/]/g, '_')}`;

/**
 * Upload a map image to Supabase Storage. Returns the public download URL and
 * the storage path. Supabase receives the signed-in Firebase user's ID token.
 */
export const uploadMapImage = async (
  bucket: string,
  storagePath: string,
  file: File,
): Promise<{ imageUrl: string; storagePath: string }> => {
  const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { imageUrl: data.publicUrl, storagePath };
};

/**
 * Delete a map image from Supabase Storage. Best-effort: a missing file is
 * not an error, because the Firestore object record is the source of truth.
 */
export const deleteMapImage = async (
  bucket: string,
  storagePath: string,
): Promise<void> => {
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error && error.message !== 'Object not found') {
    throw new Error(`Failed to delete image: ${error.message}`);
  }
};
