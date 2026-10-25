import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { Layer, MapObject } from '../types';
import { setFirebaseAccessTokenProvider } from './supabase';

// ------------------------------------------------------------------
// CRITICAL: You must replace this config with your own from Firebase Console!
// 1. Go to console.firebase.google.com
// 2. Create a project
// 3. Register a Web App
// 4. Copy the config below
// 5. Enable Authentication (Google Provider)
// 6. Enable Firestore Database
// ------------------------------------------------------------------
// Debug: Log environment variables

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Services
const auth = getAuth(app);
setFirebaseAccessTokenProvider(async () => auth.currentUser?.getIdToken() ?? null);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

// Development mode settings
if (import.meta.env.DEV) {
  // Configure auth emulator if needed
  // connectAuthEmulator(auth, 'http://localhost:9099');
  
  // Configure firestore emulator if needed
  // connectFirestoreEmulator(db, 'localhost', 8080);
}

export { auth, googleProvider, db };

// Log Firebase initialization
console.log('Firebase initialized with app:', app.name);

// Export Supabase client for storage operations
// (re-exported from ./supabase.ts for convenience in components)
export { supabase } from './supabase';


// --- Firestore Helpers for Scalable Data ---

// Helper to chunk arrays for batch operations (Firestore limit is 500 ops)
const chunkArray = <T>(arr: T[], size: number): T[][] => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
};

/**
 * Loads user data.
 * Strategy:
 * 1. Load 'layers' from the root user document.
 * 2. Load 'objects' from the 'mapObjects' subcollection.
 * 3. MIGRATION: If 'objects' exist in the root doc (legacy format), move them to subcollection.
 */
export const loadUserData = async (uid: string): Promise<{ layers: Layer[] | null, objects: MapObject[] }> => {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    
    let layers: Layer[] | null = null;
    let objects: MapObject[] = [];
    let legacyObjects: MapObject[] = [];

    if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        layers = data.layers || null;
        
        // Check for legacy monolithic storage
        if (data.objects && Array.isArray(data.objects) && data.objects.length > 0) {
            console.log(`Found ${data.objects.length} legacy objects. Migrating...`);
            legacyObjects = data.objects;
        }
    }

    // Load from Subcollection
    const objsRef = collection(db, 'users', uid, 'mapObjects');
    const objsSnap = await getDocs(objsRef);
    const subObjects = objsSnap.docs.map(d => d.data() as MapObject);
    
    objects = [...subObjects];

    // Perform Migration if needed
    if (legacyObjects.length > 0) {
        // 1. Add to local list so UI updates immediately
        objects = [...objects, ...legacyObjects];
        
        // 2. Persist to subcollection in background
        saveObjectsBatch(uid, legacyObjects).then(async () => {
            // 3. Remove from root doc to free up space
            await updateDoc(userDocRef, {
                objects: deleteField()
            });
            console.log("Migration complete: Legacy objects moved to subcollection.");
        }).catch(err => console.error("Migration failed:", err));
    }

    return { layers, objects };
};

/**
 * Save only Layers configuration to the root document.
 */
export const saveLayers = async (uid: string, layers: Layer[]) => {
    const userDocRef = doc(db, 'users', uid);
    // Merge true to avoid overwriting other fields if they exist
    await setDoc(userDocRef, { layers }, { merge: true });
};

/**
 * Save a single map object to the subcollection.
 */
export const saveObject = async (uid: string, obj: MapObject) => {
    const objRef = doc(db, 'users', uid, 'mapObjects', obj.id);
    await setDoc(objRef, obj);
};

/**
 * Delete a single map object from the subcollection.
 */
export const deleteObject = async (uid: string, objId: string) => {
    const objRef = doc(db, 'users', uid, 'mapObjects', objId);
    await deleteDoc(objRef);
};

// Image storage moved to Supabase (see ./supabase.ts). These re-exports keep
// the call sites in App.tsx and the tests agnostic to which backend stores
// the file. The storage path shape is unchanged: users/<uid>/mapImages/<objectId>/<fileName>.
export {
  uploadMapImage,
  deleteMapImage,
  buildMapImageStoragePath,
} from './supabase';
export { MAP_IMAGES_BUCKET } from './supabase';

/**
 * Save multiple objects (e.g., import) using Batch writes.
 */
export const saveObjectsBatch = async (uid: string, objects: MapObject[]) => {
    // Firestore batches allow max 500 operations.
    const chunks = chunkArray(objects, 450); // safe margin

    for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(obj => {
            const ref = doc(db, 'users', uid, 'mapObjects', obj.id);
            batch.set(ref, obj);
        });
        await batch.commit();
    }
};
