# Map Image Objects Design

## Goal

Let users add uploaded images as editable geographic overlays and have them participate in the same map-object workflows as points, circles, lines, and polygons.

## Agreed behavior

- An image is a first-class `MapObject` variant and belongs to the active layer.
- The user chooses a local image file from an Image tool in the toolbar.
- The image is uploaded to Firebase Storage. The object stores metadata and geographic bounds, not binary data.
- The initial rectangle is sized using the current map view/zoom. The user can move and resize it after placement.
- Images use the shared object lifecycle: layer visibility, selection, title and description, sidebar listing/navigation, deletion, Firestore persistence, and project import/export.
- Project exports retain the image URL and object metadata. Imported overlays continue to reference the original Firebase Storage image.
- The proposed client upload limit is 10 MB; the same limit and user-scoped access should be enforced in Firebase Storage rules.

## Data model and persistence

Add `MapImage` to the `MapObject` discriminated union with the base object fields, an image download URL, a Storage object path/owner identifier for lifecycle management, and geographic bounds represented by southwest and northeast corners. Existing Firestore `mapObjects` documents continue to store each object by its ID, so loading and saving need no separate image collection.

Store files under a user-scoped path such as `users/{uid}/mapImages/{objectId}/{filename}`. Upload requires an authenticated user. If a user is signed out, the image action should explain that sign-in is required; existing local map drawing remains unchanged. Validate image MIME type and the 10 MB limit before upload. If upload or URL retrieval fails, do not create a map object. Surface a concise error in the UI.

On object deletion or layer deletion, delete the Storage file only when the stored owner matches the current user and a Storage path is available, then delete the Firestore object. Imported project objects preserve their original URL and ownership metadata; a user who imports another user's project can display the shared download URL but cannot delete the original owner's Storage file. Storage deletion errors must be surfaced/logged and must not silently remove the only file reference before the failure can be handled.

## Placement and editing

Use the active Leaflet map's current center and visible geographic extent to compute initial bounds at the current zoom. The default overlay occupies 30% of the visible map width, with its height derived from the image's intrinsic aspect ratio. After creation, the overlay renders within those bounds. Selection exposes move and resize handles; moving translates both bounds, and resizing updates the selected corner while maintaining valid southwest/northeast ordering. Bounds updates use the existing optimistic object-update flow and persist through `saveObject`.

The shared popup continues to edit title and description and delete the object. The image itself is shown in the popup/overlay as appropriate, with accessible alternative text derived from its title.

## Integration points

- `src/types.ts`: add `MapImage` and its bounds type to the object union.
- `src/utils/firebase.ts`: initialize Firebase Storage and provide upload/delete helpers.
- `src/App.tsx`: route file selection through upload, create the object in the active layer, and coordinate Storage cleanup for object/layer deletion.
- `src/components/Toolbar.tsx`: add an Image action and file input integration.
- `src/components/MapBoard.tsx` and `MapBoardEditable.tsx`: render the image overlay and handle selection, move, and resize.
- `src/components/LayerSidebar.tsx`: show an image icon in the layer object list.
- `src/utils/fileImporter.ts`: preserve `MapImage` metadata during project JSON import/export; standard GeoJSON behavior remains unchanged.
- Firebase Storage security rules/configuration: enforce authenticated per-user writes, image content types, and the agreed file-size limit. The repository currently has no Firebase rules/configuration file, so deployment setup must be documented or supplied as part of implementation.

## Failure handling and cleanup

Validate before upload. On upload failure, leave the map unchanged and show an error. If Storage upload succeeds but Firestore persistence fails, attempt to remove the uploaded file to avoid an orphan. Deleting an object or its layer removes owned Storage files and corresponding Firestore documents; report cleanup failures so the user can retry or an administrator can diagnose them. Existing generic object deletion remains unchanged for objects without Storage metadata.

## Verification

Use Playwright MCP to view the UI.

Cover image type compatibility and JSON round trips; toolbar file selection and validation; upload success/failure and orphan cleanup; initial viewport-relative bounds; overlay rendering, moving, resizing, and metadata editing; layer visibility/listing; and owned versus imported Storage cleanup. Run the existing build, lint, and test suite as appropriate during implementation.

The 30% viewport-width fraction should be a named constant so it can be adjusted without changing the placement algorithm.
