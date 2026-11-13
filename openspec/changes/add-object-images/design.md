# Design

## Context

Objects carry `title`/`description` only (`BaseMapObject`, `src/types.ts`). Map image overlays already solve storage and validation: `validateImageFile` (image type + 10 MB, `src/utils/imageOverlay.ts`), `uploadMapImage`/`deleteMapImage` against the Supabase `map-images` bucket behind the backend-agnostic `src/utils/firebase.ts` re-export, and path convention `users/<uid>/mapImages/<objectId>/<fileName>`. The Properties panel (`ObjectDetailsPanel.tsx`) renders Title → Description → type-specific details; the Images section slots between Description and the type-specific details. Persistence is optimistic: `patchObject` merges locally then `saveObject` full-document `setDoc` (no merge), with fire-and-forget error logging (`use-workspace.ts`).

Attachment lifecycle differs from overlays in one important way: an overlay's file reference is the object's whole payload (storage delete is strict, before the Firestore delete), while an attachment is one of several references on a still-existing object (cleanup can be best-effort after the document update).

## Goals / Non-Goals

**Goals:**

- Attachments ride the existing overlay storage plumbing (same bucket, same validation, same delete helper) — no new infrastructure.
- Multi-file pick with strict pre-upload batch validation and partial-success tolerance for upload failures.
- Attachment cleanup matches the overlay's ownership rules: only files under the current user's own storage prefix are deleted.

**Non-Goals:**

- Showing attachments on the map (popups/markers), reordering, captions, compression.
- Disabling other panel editing (title/description/delete) while signed out — the view-only rule is images-only.
- Capturing attachment files in project-file import/export beyond whole-object serialization (they carry automatically since objects are serialized whole; imported files from another owner are never storage-deleted, matching imported overlay behavior).

## Decisions

### D1. `images?: MapObjectImage[]` on `BaseMapObject`, optional

`MapObjectImage = { id, imageUrl, fileName, storagePath?, storageOwnerId? }`. Same pattern as `MapImage.rotation?`/`opacity?`: absent means "no attachments", so existing Firestore documents and project files load unchanged, and every object type gets the section for free. Not putting the array on the `image` overlay subtype specifically — attachments are a property of *any* object, and splitting them by type would double the panel logic.

Alternative considered: a separate Firestore attachment subcollection. Rejected: the panel, save path, and project-file export already treat objects as whole documents; a subcollection would need its own load/save/import plumbing for no benefit at expected attachment counts.

### D2. Storage path `users/<uid>/objectImages/<objectId>/<imageId>/<fileName>`

`buildObjectImageStoragePath(uid, objectId, imageId, fileName)` in `src/utils/supabase.ts`, re-exported from `firebase.ts` (existing pattern keeps call sites and tests backend-agnostic). The `imageId` segment (UUID generated per attachment) prevents collisions when one object holds multiple attachments with the same filename. Filename sanitization is reused from `buildMapImageStoragePath` (`fileName.replace(/[\\/]/g, '_')`) — without it a filename containing `/` creates a surprise subfolder and breaks the ownership prefix.

### D3. Strict pre-upload batch validation

All picked files run through `validateImageFile` before anything uploads. Any invalid file rejects the whole batch with a toast naming the offending file(s). Because validation is client-side and precedes every upload, a rejected batch produces **zero** storage side effects — no cleanup orchestration needed. Alternative considered: permissive (skip invalid, upload the rest). Rejected per user decision: predictable all-or-nothing at the gate; a 10 MB-plus vacation photo should not silently vanish from a batch.

### D4. Parallel uploads, partial success with retry

Valid files upload concurrently (`Promise.allSettled`). Successful uploads are attached; failures toast. Retry is simply re-picking the failed file — no queue state to persist. The successful set is appended in a **single** `patchObject(id, { images: [...existing, ...uploaded] })` call: one Firestore write, one local re-render, and the array is computed from the freshly merged object state so concurrent panel edits (e.g. a title keystroke during upload) survive the merge.

### D5. Remove: document-first, best-effort storage cleanup

`patchObject` drops the image from the array; afterwards `deleteMapImage` runs best-effort on the owned file (`storageOwnerId === user.uid && storagePath`), toasting on failure and accepting the orphan. This deliberately inverts the overlay delete's strictness: the overlay rule exists because a Storage failure must not remove the object's *only* file reference; an attachment removal failing must not wedge the panel or block the remove. A failed cleanup leaves an orphaned file in the user's own bucket — accepted cost, surfaced via the existing error toast.

### D6. Object deletion: best-effort attachment cleanup, strict overlay unchanged

`deleteObjectSafely` keeps its existing strict storage-first branch for owned overlay files. It gains a best-effort pass over the target's owned attachment files (removes what it can, continues on individual failures, surfaces any failure) before the existing Firestore delete. Alternative considered: making attachment cleanup strict like overlays (retain the object on failure). Rejected per user decision: silent retry affordance matters less than not blocking object deletion; orphans are cheap and user-owned.

### D7. Signed-out behavior: view-only attachments, images-only scope

Signed-out users see thumbnails (public URLs) but the Add tile is disabled with "Sign in to add images." and remove controls are not rendered. Prop-driven via `canAddImages` (uid check in `App.tsx`) so the panel stays pure. Note: this does *not* change the pre-existing behavior that signed-out users can edit other panel fields locally — that broader rule is out of scope here.

### D8. Panel props and threading

`ObjectDetailsPanel` gains `canAddImages: boolean`, `onAddImage(id: string, files: File[])`, `onRemoveImage(id: string, imageId: string)`. `LayerSidebar` threads them from `App.tsx` (the same composition-root pattern as the existing upload orchestration — validation, storage, and persistence stay in App, the panel stays presentational). A hidden `<input type="file" multiple accept="image/*">` is wired to the dashed Add tile.

## Risks / Trade-offs

- [Supabase RLS policies may pin the `mapImages` folder or segment depth, breaking uploads to the new `objectImages/` prefix] → Spike task before upload work: verify the policies match `users/<uid>/` as a prefix and cover the deeper 4-segment path; adjust the policy in the Supabase project if not. Unverifiable from this repo (policies live in the cloud project).
- [Full-document `setDoc` means two tabs editing the same object can lose images (last-write-wins on the whole document)] → Pre-existing single-writer behavior that this change extends, not introduces; documents are per-user, so exposure is one user with two tabs. Accepted.
- [Fire-and-forget persistence: if the Firestore write fails after a storage delete succeeded (remove flow), the image reappears on reload with a dead URL] → Same failure class the optimistic workspace already accepts for every panel edit; the toast covers the storage half. Accepted for v1.
- [Orphaned files accrue when best-effort cleanup fails] → Accepted per user decision; failures toast, and files stay under the owner's own prefix.
- [Firestore 1 MB document limit with many attachments] → Non-issue at realistic counts: each `MapObjectImage` is ~200 bytes of metadata (no file content), so thousands of attachments fit.
- [Multi-file upload hammers the bucket with parallel large files] → 10 MB cap per file and `allSettled` isolation bound the blast radius; no artificial concurrency limit unless real usage shows one is needed.

## Migration Plan

No schema migration: `images` is optional and absent on all existing documents. Deploy is a plain front-end rollout. Rollback is revert — objects saved with attachments simply keep an unused field that old code ignores.

## Open Questions

None. The RLS uncertainty is a spike task (verifiable fact), not a design decision.
