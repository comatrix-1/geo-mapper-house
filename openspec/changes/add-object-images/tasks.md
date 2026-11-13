# Tasks

## 1. RLS verification spike (before any upload work)

- [ ] 1.1 In the Supabase project, inspect the `map-images` bucket's RLS storage policies and confirm whether they match `users/<uid>/` as a prefix and cover a deeper 4-segment path (`users/<uid>/objectImages/<objectId>/<imageId>/<fileName>`); record the policy text in the session notes. Verify by attempting a signed-in upload to a throwaway `objectImages/...` path (or reading the policy SQL) — outcome: either "policies cover the new prefix, proceed" or a written policy adjustment needed.

## 2. Data model and storage helpers

- [x] 2.1 Add `MapObjectImage` interface and optional `images?: MapObjectImage[]` to `BaseMapObject` in `src/types.ts`; verify `npm run check` (or the project's typecheck) passes with existing code untouched.
- [x] 2.2 Add `buildObjectImageStoragePath(uid, objectId, imageId, fileName)` to `src/utils/supabase.ts` reusing the filename sanitization from `buildMapImageStoragePath`, and re-export it (plus nothing new for the bucket) from `src/utils/firebase.ts`; verify with a shape test in `test/utils/firebase.test.ts` asserting the path is `users/<uid>/objectImages/<objectId>/<imageId>/<sanitized fileName>`.
- [ ] 2.3 If the spike in 1.1 found a policy gap, apply the policy fix in the Supabase project and re-verify with a real signed-in upload to an `objectImages/...` path; skip (recorded) if 1.1 confirmed coverage.

## 3. Properties panel: Images section

- [x] 3.1 Extend `ObjectDetailsPanel` (`src/components/ObjectDetailsPanel.tsx`) with the Images section between Description and type-specific details: thumbnail grid (~56–64 px `object-cover` squares), each thumbnail an `<a target="_blank">` opening the full image with an overlaid remove button (`aria-label="Remove image <fileName>"`), plus a dashed Add tile wired to a hidden `<input type="file" multiple accept="image/*">`; verify the new `test/components/ObjectDetailsPanel.images.test.tsx` passes for: thumbnails render from `obj.images`, remove calls `onRemoveImage(id, imageId)`, file selection calls `onAddImage(id, files)`.
- [x] 3.2 Disable Add and hide remove controls when `canAddImages={false}`, showing the "Sign in to add images." hint while existing thumbnails still render; verify via the signed-out scenarios in `ObjectDetailsPanel.images.test.tsx`.
- [x] 3.3 Thread the new props (`canAddImages`, `onAddImage`, `onRemoveImage`) through `LayerSidebar` and update existing `ObjectDetailsPanel`/`LayerSidebar` test render sites to pass them; verify `npm test` passes with no new failures in the panel and LayerSidebar suites.

## 4. Orchestration in App

- [x] 4.1 Implement multi-file attach in `src/App.tsx`: validate the whole batch with `validateImageFile` before any upload (strict all-or-nothing, toast naming offending file(s)); on all-valid, generate an image id per file, upload in parallel with `Promise.allSettled`, and append the successful uploads in a single `patchObject(id, { images: [...existing, ...uploaded] })`; verify with `App.test.tsx` cases: batch with an invalid file uploads nothing and toasts, valid batch attaches all files in one update, partial upload failure attaches successes and toasts.
- [x] 4.2 Implement attachment remove in `src/App.tsx`: `patchObject` drops the image first, then best-effort `deleteMapImage` of the owned file (ownership = `storageOwnerId === user.uid && storagePath`), toasting on cleanup failure without undoing the removal; verify with an `App.test.tsx` case that remove updates the object even when storage delete rejects.
- [x] 4.3 Extend `deleteObjectSafely` in `src/App.tsx` to best-effort delete owned attachment files (each failure surfaced, none blocking) before the existing Firestore delete, keeping the strict storage-first overlay branch unchanged; verify with `App.test.tsx` cases: object with owned attachments deletes and files are removed, attachment cleanup failure still deletes the object, overlay-file strict behavior regression test still passes.

## 5. Integration verification

- [x] 5.1 Run the full suite (`npm test`) and typecheck; confirm no regressions across App, LayerSidebar, ObjectDetailsPanel, and utils suites.
- [ ] 5.2 Manual smoke: signed in — attach 2 images to a point, remove one, delete the object (files gone from the bucket); signed out — thumbnails render, Add disabled with hint, no remove controls; reload after each step to confirm persistence.

## Workflow follow-up

- Archive the change after review requirements are satisfied and verify the archived result.
