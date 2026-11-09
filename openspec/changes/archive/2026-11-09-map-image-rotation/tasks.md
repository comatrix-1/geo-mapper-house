# Tasks

## 1. Rotation geometry utilities

- [x] 1.1 Add a rotation utility module (projected-plane corner rotation around the image center, angle-from-pointer computation, and 15-degree snapping) with pure functions and verify with unit tests in `test/utils/` covering identity at 0 degrees, quarter-turn corner positions, snapping on/off Shift, and pointer-angle deltas (`npm test`).
- [x] 1.2 Add an optional `rotation` (degrees) field to the persisted `MapImage` type, treating absent as zero, and verify `npx tsc` succeeds and existing tests still pass.

## 2. Rotated frame rendering

- [x] 2.1 Render a selected or rotated image into its rotated frame: derive the four projected corners from center, pixel size, and angle, and recompute them as the map pans/zooms so rotation stays stable in map space; verify the rotation math via unit tests and observable behavior (image tilts by the stored angle, frame tracks the image on pan/zoom).
- [x] 2.2 Draw the selection frame and place move and resize handles on the same rotated corners so visual boundary, hit targets, and the rotation gesture agree; verify with component tests that handle positions follow a nonzero rotation.

## 3. Rotation gesture

- [x] 3.1 Start a rotation drag when the pointer goes down outside the selected image's rotated frame, using the image center as a fixed pivot, with a live transient preview angle and an angle readout during the drag; verify with a component test that dragging outside the frame updates the preview angle and readout without persisting.
- [x] 3.2 Snap the preview angle to 15-degree increments while Shift is held (read live so it can toggle mid-drag); verify with a component test that Shift mid-gesture snaps the readout.
- [x] 3.3 Commit the final angle on pointer release through the existing `onUpdate` object-update path, keep the image selected, and confirm the angle persists through the workspace save path with no data migration (old records load upright); verify with a component test asserting `onUpdate` receives the rotation and that a loaded image without the field renders at zero.
- [x] 3.4 Show a rotation cursor over the area just outside a selected image's frame where a rotation drag begins, so rotatability is discoverable; verify with a component test that the rotation cursor appears in the drag area and the normal cursor resumes elsewhere.
- [x] 3.5 Exclude a keep-out around each frame corner from the rotation grab zone (press and hover cursor) so near-corner presses belong to the resize handles; verify with unit tests for the corner-zone helper and a component test that a press inside the band but within the keep-out starts no rotation.
- [x] 3.6 End rotation and handle drags on window blur or the pointer leaving the document, committing the last seen state, so a release outside the window cannot leave a gesture armed; verify with the existing gesture test suite passing (the abandon path shares the same end handler as mouseup).

## 4. Keep existing edits working with rotation

- [x] 4.1 Move translates the rotated image retaining its angle, and resize (both aspect-locked corner handles and independent-corner vertex handles) changes the footprint around the rotated frame while retaining the angle; verify with unit/component tests that existing move and resize behavior passes with a nonzero rotation and the angle is unchanged.
