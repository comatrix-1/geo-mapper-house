# Proposal

## Why

Map objects carry only a title and description, so reference/field photos have nowhere to live except as separate map-image overlays — a different concept (a georeferenced raster drawn on the map) that clutters the map. Attaching images to the object keeps the reference with the object without drawing anything new on the map. (GitHub issue #5.)

## What Changes

- Any map object (point, circle, polyline, polygon, image overlay) can hold attached images via a new optional `images` field on `BaseMapObject`.
- The Properties panel gains an Images section between Description and type-specific details: a thumbnail grid with full-image links and per-thumbnail remove buttons.
- A dashed Add tile opens a multi-file picker (`image/*`, no per-pick count cap):
  - Strict client-side validation of the whole batch before any upload — if any file fails the shared image validation (type, 10 MB max), the entire batch is rejected with a toast naming the offending file(s) and nothing uploads.
  - Valid files upload in parallel; on partial upload failure the successful uploads are attached and failures toast (retry by re-picking).
  - All attached images land in a single `patchObject` update (one Firestore write).
- Attachment remove: document update first, best-effort storage delete afterwards; a storage delete failure toasts and accepts the orphaned file rather than blocking the removal.
- Deleting an object best-effort deletes its owned attachment files before the Firestore delete. The existing strict storage-first behavior for image overlays is unchanged.
- Signed-out users see existing thumbnails but the Add and remove controls are disabled with a "Sign in to add images." hint (uploads require the signed-in user's storage token). Editing restriction is images-only; other panel editing is unchanged.
- New storage path builder for attachment files, reusing existing filename sanitization, in the existing `map-images` bucket.

Out of scope: showing attachments on the map itself (popups/markers), reordering, captions, compression, disabling other panel editing while signed out. Project-file export/import carries `images` automatically because whole objects are serialized — no importer change needed.

## Capabilities

### New Capabilities

- `map-object-images`: Attaching, viewing, removing, and lifecycle-managing (storage cleanup on remove and object deletion) image attachments on map objects, including signed-out view-only behavior and persistence of the attachment list.

### Modified Capabilities

None. Existing specs (`google-tile-provider`, `map-image-opacity`, `map-object-geometry-editing`) are unaffected.

## Impact

- **Code:** `src/types.ts` (`MapObjectImage`, `BaseMapObject.images?`), `src/utils/supabase.ts` + re-export in `src/utils/firebase.ts` (`buildObjectImageStoragePath`), `src/App.tsx` (multi-file attach orchestration, remove, `deleteObjectSafely` extension), `src/components/LayerSidebar.tsx` (prop threading), `src/components/ObjectDetailsPanel.tsx` (Images section, new props).
- **Storage:** files under `users/<uid>/objectImages/<objectId>/<imageId>/<fileName>` in the existing `map-images` Supabase bucket; requires verifying RLS policies cover the new `objectImages/` prefix (spike task).
- **Firestore:** `patchObject` full-document `setDoc` rewrites the object with the new `images` array; documents stay far below the 1 MB limit (attachment metadata is small).
- **Tests:** new `test/components/ObjectDetailsPanel.images.test.tsx`, storage-path shape test, updates to existing panel/LayerSidebar render sites and the `firebase` mock in `App.test.tsx`.
