# Map Image Objects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users upload, place, edit, persist, import, export, and safely delete image overlays as first-class map objects.

**Architecture:** Extend the discriminated map-object model with a serializable image overlay and use a small pure geometry module for bounds validation, translation, resizing, and viewport-relative placement. `App` owns the authenticated upload and Storage/Firestore cleanup transactions; `MapBoard` supplies the live viewport and renders an editable `ImageOverlay` through the existing object lifecycle.

**Tech Stack:** React 19, TypeScript, Leaflet/React-Leaflet, Firebase Auth/Firestore/Storage, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-11-map-image-objects-design.md`

## Global Constraints

- Images are a `MapObject` variant, assigned to the active layer and stored as metadata plus geographic bounds; never store binary image data in Firestore.
- Require an authenticated user before upload; ordinary local drawing behavior remains unchanged while signed out.
- Accept only image MIME types and files at or below 10 MB; declare `MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024` once and reuse it.
- Store uploads at `users/{uid}/mapImages/{objectId}/{filename}` and retain `imageUrl`, `storagePath`, and `storageOwnerId` with the object.
- Initial image width is the named `IMAGE_VIEWPORT_WIDTH_FRACTION = 0.3` of the current viewport; height preserves intrinsic aspect ratio.
- A failed upload or download-URL lookup must create no object. A failed Firestore save after upload must attempt Storage cleanup.
- Delete Storage first only for an image whose `storageOwnerId` matches the signed-in user and whose `storagePath` is present; report cleanup failure and retain the local/Firestore reference for retry.
- Project JSON retains all image metadata and URLs. GeoJSON/KML/KMZ import behavior remains unchanged.
- Firebase Storage rules must require authenticated, user-scoped image uploads of at most 10 MB.

## Review Focus

- A file whose browser-supplied MIME type is empty or non-image must be rejected before calling Storage; cover in Task 1.
- An image exactly 10 MB must be accepted while one byte larger is rejected; cover in Task 1.
- A portrait image and a landscape image must produce valid, correctly ordered viewport-relative bounds; cover in Task 1.
- An imported image with another user’s storage owner/path must remain visible but must never invoke Storage deletion; cover in Task 5.
- If an owned file deletes successfully but its Firestore deletion fails, show an error and log it for diagnosis rather than hiding the failed persistence action; cover in Task 5.

---

## File Structure

- `src/types.ts` — serializable `MapImage` and bounds types in the shared union.
- `src/utils/imageOverlay.ts` — image validation, intrinsic-size lookup, and pure bounds arithmetic.
- `src/utils/firebase.ts` — Firebase Storage initialization and upload/delete helpers.
- `src/components/Toolbar.tsx` — accessible Image action and resettable hidden file input.
- `src/components/MapBoard.tsx` — publishes active Leaflet map and routes image objects to their editor.
- `src/components/MapBoardEditable.tsx` — renders the overlay, popup preview, move handle, and corner resize handles.
- `src/components/LayerSidebar.tsx` — image icon for list entries.
- `src/App.tsx` — upload workflow, viewport placement, inline errors, and safe object/layer cleanup.
- `storage.rules` — deployable Storage authorization and validation rules.
- `README.md` — Storage enablement/rules deployment instructions.
- `test/utils/imageOverlay.test.ts`, `test/utils/firebase.test.ts`, `test/components/Toolbar.test.tsx`, `test/components/MapBoardEditable.test.tsx`, `test/App.test.tsx` — focused behavior coverage.

### Task 1: Add the image-object contract and pure overlay geometry

**Files:**
- Modify: `src/types.ts:3-33`
- Create: `src/utils/imageOverlay.ts`
- Modify: `src/utils/geoUtils.ts:76-84`
- Test: `test/utils/imageOverlay.test.ts`

**Interfaces:**
- Produces: `MapImageBounds { southWest: LatLngLiteral; northEast: LatLngLiteral }`, `MapImage extends BaseMapObject`, and `MapObject` including `MapImage`.
- Produces: `validateImageFile(file: File): string | null`, `getImageDimensions(file: File): Promise<{ width: number; height: number }>`, `createImageBounds(map: L.Map, aspectRatio: number): MapImageBounds`, `translateImageBounds(bounds: MapImageBounds, delta: LatLngLiteral): MapImageBounds`, and `resizeImageBounds(bounds: MapImageBounds, draggedCorner: 'northWest' | 'northEast' | 'southWest' | 'southEast', position: LatLngLiteral): MapImageBounds`.
- Produces: `getObjectCenter(image: MapImage): LatLngLiteral` behavior via the existing `getObjectCenter` union switch.

- [ ] **Step 1: Write failing utility tests**

```ts
expect(validateImageFile(new File(['x'], 'map.png', { type: 'image/png' }))).toBeNull();
expect(validateImageFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).toMatch(/10 MB/);
expect(validateImageFile(new File(['x'], 'map.txt', { type: 'text/plain' }))).toMatch(/image/);
expect(createImageBounds(mapAtZoom, 2).southWest.lat).toBeLessThan(createImageBounds(mapAtZoom, 2).northEast.lat);
expect(resizeImageBounds(bounds, 'northEast', { lat: -4, lng: -3 })).toEqual({ southWest: { lat: -4, lng: -3 }, northEast: { lat: 2, lng: 1 } });
```

- [ ] **Step 2: Run the utility test to verify it fails**

Run: `npm run test -- test/utils/imageOverlay.test.ts`

Expected: FAIL because the image-overlay module and exported types do not exist.

- [ ] **Step 3: Implement the `MapImage` contract and `imageOverlay` helpers**

Define `MapImage` with `type: 'image'`, `imageUrl`, `storagePath?: string`, `storageOwnerId?: string`, `fileName`, `contentType`, and `bounds`. Use Leaflet `map.project`/`map.unproject` around `map.getCenter()` at `map.getZoom()` so `createImageBounds` has a pixel width of `map.getSize().x * IMAGE_VIEWPORT_WIDTH_FRACTION`, height `width / aspectRatio`, and valid southwest/northeast corners. Use `Image` plus an object URL for intrinsic dimensions and always revoke the object URL after load/error.

- [ ] **Step 4: Run the utility test to verify it passes**

Run: `npm run test -- test/utils/imageOverlay.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/utils/imageOverlay.ts src/utils/geoUtils.ts test/utils/imageOverlay.test.ts
git commit -m "feat: add image overlay model and geometry"
```

### Task 2: Add Firebase Storage operations and the toolbar chooser

**Files:**
- Modify: `src/utils/firebase.ts:1-44`
- Modify: `src/components/Toolbar.tsx:1-55`
- Modify: `vite.config.ts:11-19`
- Test: `test/utils/firebase.test.ts`
- Test: `test/components/Toolbar.test.tsx`

**Interfaces:**
- Consumes: `validateImageFile(file: File): string | null` from Task 1.
- Produces: `storage`, `uploadMapImage(uid: string, objectId: string, file: File): Promise<{ imageUrl: string; storagePath: string }>`, and `deleteMapImage(storagePath: string): Promise<void>`.
- Produces: `ToolbarProps` addition `onImageFileSelected: (file: File) => void` and an Image button labelled `Image`.

- [ ] **Step 1: Write failing Storage and toolbar tests**

```tsx
await expect(uploadMapImage('u1', 'o1', pngFile)).resolves.toEqual({
  imageUrl: 'https://download.example/image.png',
  storagePath: 'users/u1/mapImages/o1/map.png',
});
expect(mockUploadBytes).toHaveBeenCalledWith(expect.anything(), pngFile, { contentType: 'image/png' });

render(<Toolbar activeMode="none" setMode={setMode} onImageFileSelected={onImageFileSelected} />);
await user.upload(screen.getByLabelText('Choose image file'), pngFile);
expect(onImageFileSelected).toHaveBeenCalledWith(pngFile);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm run test -- test/utils/firebase.test.ts test/components/Toolbar.test.tsx`

Expected: FAIL because Storage helpers and the Image chooser prop are absent.

- [ ] **Step 3: Implement Storage helpers and Image chooser**

Initialize Storage with `getStorage(app)`. Build the user/object-scoped path with the original file name after replacing `/` and `\\` with `_`; call `uploadBytes(ref(storage, path), file, { contentType: file.type })`, then `getDownloadURL`, and call `deleteObject(ref(storage, storagePath))` for cleanup. Add `firebase/storage` to Vite’s Firebase manual chunk. Add a hidden `<input aria-label="Choose image file" type="file" accept="image/*">` whose Image button opens it, forwards its first file to `onImageFileSelected`, and clears its value so the same file can be selected again.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npm run test -- test/utils/firebase.test.ts test/components/Toolbar.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/firebase.ts src/components/Toolbar.tsx vite.config.ts test/utils/firebase.test.ts test/components/Toolbar.test.tsx
git commit -m "feat: add image upload storage helpers"
```

### Task 3: Render and edit image overlays on the map

**Files:**
- Modify: `src/components/MapBoard.tsx:1-242`
- Modify: `src/components/MapBoardEditable.tsx:1-441`
- Modify: `src/components/LayerSidebar.tsx:3-23,243-252`
- Test: `test/components/MapBoardEditable.test.tsx`

**Interfaces:**
- Consumes: `MapImage`, `MapImageBounds`, and `translateImageBounds`/`resizeImageBounds` from Task 1.
- Produces: `MapBoardProps` addition `onMapReady?: (map: L.Map) => void`.
- Produces: `EditableImage(props: EditableObjectProps): React.ReactElement` and ImageOverlay updates emitted through `onUpdate(id, { bounds })`.

- [ ] **Step 1: Write failing image-rendering and editing tests**

```tsx
render(<EditableImage obj={imageObject} {...sharedProps} isSelected />);
expect(screen.getByAltText('Survey photo')).toHaveAttribute('src', imageObject.imageUrl);
fireEvent.dragEnd(screen.getByLabelText('Move image overlay'), { target: markerAt({ lat: 3, lng: 4 }) });
expect(onUpdate).toHaveBeenCalledWith(imageObject.id, { bounds: expectedTranslatedBounds });
fireEvent.dragEnd(screen.getByLabelText('Resize image northeast corner'), { target: markerAt({ lat: 5, lng: 6 }) });
expect(onUpdate).toHaveBeenCalledWith(imageObject.id, { bounds: expectedResizedBounds });
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npm run test -- test/components/MapBoardEditable.test.tsx`

Expected: FAIL because `EditableImage` and image-object rendering do not exist.

- [ ] **Step 3: Implement `EditableImage` and map/sidebar integration**

Use React-Leaflet `ImageOverlay` with bounds `[[southWest.lat, southWest.lng], [northEast.lat, northEast.lng]]`, `opacity={1}`, and image `alt={image.title || 'Map image'}`. Make it selectable only when `interactive`; use a draggable centre marker labelled `Move image overlay` to translate both corners, and four draggable corner markers with distinct accessible labels to resize while normalizing southwest/northeast order. Include the existing `ObjectPopup`, with a compact image preview and the existing title/description editor. Have a child `useMap` component call `onMapReady(map)` once. Route `obj.type === 'image'` to `EditableImage` and return Lucide `Image` from `getObjectIcon`.

- [ ] **Step 4: Run the component test to verify it passes**

Run: `npm run test -- test/components/MapBoardEditable.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapBoard.tsx src/components/MapBoardEditable.tsx src/components/LayerSidebar.tsx test/components/MapBoardEditable.test.tsx
git commit -m "feat: render editable map image overlays"
```

### Task 4: Orchestrate upload, placement, persistence, and errors in the application

**Files:**
- Modify: `src/App.tsx:1-333`
- Test: `test/App.test.tsx`

**Interfaces:**
- Consumes: `getImageDimensions`, `createImageBounds`, and `validateImageFile` from Task 1; `uploadMapImage` and `deleteMapImage` from Task 2; `onMapReady` from Task 3.
- Produces: `handleImageFileSelected(file: File): Promise<void>` passed to `Toolbar` and a live map ref supplied by `MapBoard`.

- [ ] **Step 1: Write failing App upload-flow tests**

```tsx
await user.upload(screen.getByLabelText('Choose image file'), pngFile);
expect(screen.getByRole('alert')).toHaveTextContent('Sign in is required to upload images.');

mockUser('u1'); mockUploadMapImage.mockResolvedValue(uploadedImage);
await user.upload(screen.getByLabelText('Choose image file'), pngFile);
expect(mockSaveObject).toHaveBeenCalledWith('u1', expect.objectContaining({
  type: 'image', layerId: '1', imageUrl: uploadedImage.imageUrl, storageOwnerId: 'u1'
}));

mockSaveObject.mockRejectedValueOnce(new Error('Firestore unavailable'));
await user.upload(screen.getByLabelText('Choose image file'), pngFile);
expect(mockDeleteMapImage).toHaveBeenCalledWith(uploadedImage.storagePath);
expect(screen.getByRole('alert')).toHaveTextContent('Could not save image overlay.');
```

- [ ] **Step 2: Run the App test to verify it fails**

Run: `npm run test -- test/App.test.tsx`

Expected: FAIL because image selection is not yet routed through App.

- [ ] **Step 3: Implement `handleImageFileSelected`**

Keep a `useRef<L.Map | null>` set by `MapBoard`. On selection, clear any previous image error; reject signed-out users and invalid files with a concise `role="alert"` message. Generate the object ID before upload, obtain intrinsic dimensions, upload, calculate initial bounds from the current map (or show `Map is still loading.` if unavailable), create a `MapImage` in the active layer, then await `saveObject` before adding it to local state. If any post-upload step fails, call `deleteMapImage(storagePath)`, log cleanup failure separately, leave objects unchanged, and expose a concise error. Keep `drawingMode` unchanged because Image is an action rather than a drawing mode.

- [ ] **Step 4: Run the App test to verify it passes**

Run: `npm run test -- test/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx test/App.test.tsx
git commit -m "feat: create image overlays from uploaded files"
```

### Task 5: Make object and layer deletion Storage-safe, and ship Storage rules

**Files:**
- Modify: `src/App.tsx:92-230`
- Modify: `src/components/MapBoard.tsx:107-174`
- Create: `storage.rules`
- Modify: `README.md:50-67,88-103`
- Test: `test/App.test.tsx`

**Interfaces:**
- Consumes: `MapImage` ownership metadata, `deleteMapImage(storagePath: string): Promise<void>`, and existing `deleteObject(uid, objectId): Promise<void>`.
- Produces: `onObjectDelete: (id: string) => Promise<void>`; `MapBoard` awaits it before removing a map object locally.

- [ ] **Step 1: Add failing deletion and rule assertions**

```tsx
await user.click(screen.getByRole('button', { name: 'Delete Object' }));
expect(mockDeleteMapImage).toHaveBeenCalledWith(ownedImage.storagePath);
expect(mockDeleteObject).toHaveBeenCalledWith('u1', ownedImage.id);

await deleteImportedImage();
expect(mockDeleteMapImage).not.toHaveBeenCalled();

mockDeleteMapImage.mockRejectedValueOnce(new Error('Storage denied'));
await deleteOwnedImage();
expect(screen.getByRole('alert')).toHaveTextContent('Could not delete image file.');
expect(screen.getByAltText(ownedImage.title)).toBeInTheDocument();
```

Also assert `storage.rules` limits writes to `users/{userId}/mapImages/{objectId}/{fileName}`, requires `request.auth.uid == userId`, `request.resource.contentType.matches('image/.*')`, and `request.resource.size <= 10 * 1024 * 1024`.

- [ ] **Step 2: Run the deletion test to verify it fails**

Run: `npm run test -- test/App.test.tsx`

Expected: FAIL because deletion is Firestore-only and optimistic.

- [ ] **Step 3: Implement safe deletion and document deployment**

Resolve the object before deletion. For an owned image with a path, await Storage deletion first; on failure, retain the object and show/log `Could not delete image file.`. Then await Firestore deletion; on failure show/log `Could not delete image overlay.` and retain local state. For imported/unowned images and non-image objects, skip Storage and preserve existing Firestore deletion behavior. Make `MapBoard` await `onObjectDelete` before filtering local state. Apply the same ordering to every object in a deleted layer; do not remove the layer/local objects if any required cleanup fails. Add `storage.rules` with the tested rules and explain enabling Storage and deploying/copying the rules in the README.

- [ ] **Step 4: Run the deletion test to verify it passes**

Run: `npm run test -- test/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/MapBoard.tsx storage.rules README.md test/App.test.tsx
git commit -m "feat: clean up owned image storage files"
```

### Task 6: Verify image JSON round trips and the complete project

**Files:**
- Modify: `test/utils/fileImporter.test.ts`
- Modify: `README.md:7-29,88-103`

**Interfaces:**
- Consumes: `MapImage` from Task 1 and existing `saveProjectToFile`/`loadProjectFromFile` contracts.
- Produces: regression proof that project JSON retains the complete image overlay object unchanged.

- [ ] **Step 1: Write a failing project JSON round-trip test**

```ts
const image: MapImage = { ...imageObject, imageUrl: 'https://download.example/photo.png', storageOwnerId: 'owner-1' };
await expect(loadProjectFromFile(projectFileWith([image]))).resolves.toMatchObject({ objects: [image] });
```

- [ ] **Step 2: Run the file-importer test to verify it fails or exposes missing coverage**

Run: `npm run test -- test/utils/fileImporter.test.ts`

Expected: initially FAIL if the test file or project fixture support is absent; otherwise confirm the existing structural import already passes image metadata without a special GeoJSON conversion.

- [ ] **Step 3: Add only the compatibility/documentation changes required by the test**

Keep project JSON object pass-through structural so image URL, ownership, path, dimensions-derived bounds, title, and description survive export/import; do not map images into GeoJSON. Update feature and usage bullets in README to describe uploaded map images and imported-project URL behavior.

- [ ] **Step 4: Run focused and full verification**

Run: `npm run test -- test/utils/fileImporter.test.ts && npm run lint && npm run build && npm run test -- --run`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add test/utils/fileImporter.test.ts README.md
git commit -m "test: cover image project round trips"
```

## Self-Review

- Spec coverage: Tasks 1–3 cover the type, placement, rendering, selection, editing, popup, sidebar, and visibility pathways; Tasks 2 and 4 cover authenticated validation/upload and orphan cleanup; Task 5 covers object/layer lifecycle plus Storage rules; Task 6 covers import/export and complete verification. No requirements are unassigned.
- Type consistency: all later tasks use `MapImage`, `MapImageBounds`, `uploadMapImage`, `deleteMapImage`, and `onMapReady` defined in earlier tasks.
- Review focus: each listed failure mode has a named owning task and an explicit test step.
- Proportion: this plan specifies interfaces, decisions, and tests without prescribing component bodies.

