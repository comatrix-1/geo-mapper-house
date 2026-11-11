# Design

## Context

See `proposal.md` for motivation and `specs/map-object-geometry-editing/spec.md` for the user-facing contract. Images are persisted as `MapImage` objects with geographic axis-aligned bounds. The map renders them as Leaflet image overlays; selected images have move and resize handles. Object updates use the existing workspace persistence path.

## Goals / Non-Goals

**Goals:**

- Preserve a rotation angle with each image and render the image and its selection frame at that angle.
- Keep rotation visually stable in map space as the user pans or zooms.
- Preview rotation during the pointer drag and commit it through the existing object update flow on release.
- Keep existing image move and resize operations available after rotation.

**Non-Goals:**

- Add skew, distort, perspective, warp, or other transform operations.
- Modify the uploaded source image or create a new raster file for each rotation.

## Decisions

### Store rotation as image geometry

Add an optional rotation angle in degrees to the persisted image object. Treat a missing angle as zero so existing saved images remain upright without a data migration. Keep the existing bounds as the image's unrotated footprint and derive the displayed frame from its center, dimensions, and angle.

This keeps the original uploaded image lossless and lets the existing object persistence path save rotation along with the image. Rewriting the bitmap on every change would degrade image quality and require replacing the stored asset.

### Rotate in the map's projected plane

Project the image center and frame into the map's display plane, rotate the four frame corners around that center, then render the image into the rotated quadrilateral. Derive the frame and its handles from the same projected corners so the visual boundary, hit targets, and rotation gesture agree. Recompute projected positions as the map view changes.

A CSS-only rotation of the current axis-aligned image overlay is simpler, but it couples the rotation to Leaflet's own element transforms and does not provide a shared geometry for the handles. A projected quadrilateral gives the renderer and interaction controls one consistent frame.

### Keep the drag preview transient and commit on release

During the gesture, update a transient preview angle and angle readout. When the pointer is released, patch the image's persisted rotation through the existing object update callback. This follows the current pattern of previewing geometry during a drag and saving the final geometry when the gesture ends; there is no separate confirmation step.

Use the center of the image as a fixed rotation pivot. When Shift is held, snap the preview angle to 15-degree increments. Begin rotation by dragging outside the selected frame, matching PhotoCraft's Free Transform rotation affordance. The point where the gesture begins is the band outside the frame minus a keep-out around each corner, so pressing near a corner always belongs to that corner's resize handle; the hover rotation cursor uses the same grab zone. While the pointer hovers over the area just outside the frame where the gesture begins, show a rotation cursor (circular arrows) so the affordance is discoverable before the first drag. Inside the frame and beyond the drag area, the pointer keeps its existing cursor.

### Keep existing image editing available

Move operations translate the image while retaining its angle. Resize operations change the image footprint while retaining its angle; their handles must follow the rotated frame. Individual-corner editing remains an independent-corner operation. No additional transform modes are introduced.

## Risks / Trade-offs

- [A rotated image needs rendering beyond an axis-aligned `ImageOverlay`] -> Use a renderer that maps the original image into a four-corner projected frame, and share that frame geometry with selection and drag controls.
- [Older saved images have no rotation field] -> Interpret an absent angle as zero; keep the field optional at the persistence boundary.
- [Map projection changes apparent dimensions across latitude] -> Calculate the rotation and its corners in the current map's projected plane rather than applying degrees directly to latitude and longitude.
- [A press aimed at a corner handle can land in the 24px grab band outside the frame] -> Keep a keep-out around each corner so resize wins near handles.
- [Releasing a drag outside the window fires no mouseup, leaving the gesture armed] -> End rotation and handle drags on window blur and the pointer leaving the document, committing the last seen state, with an ended guard against a belated mouseup.

## Migration Plan

No bulk data migration is needed. Existing image records without a rotation angle load as zero degrees. Newly rotated images save their angle with their existing image geometry.
