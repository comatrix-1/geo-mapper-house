# Tasks

## 1. Geometry transforms

- [x] 1.1 Add projected bounding-box corner and whole-shape resize helpers for images, polylines, and polygons, including opposite-corner anchoring, proportional scaling, Shift-enabled independent axes, and safe handling of zero-width or zero-height bounds; verify focused utility tests cover each case.
- [x] 1.2 Add circle resize geometry that derives center and meter radius from a round projected bounding box anchored at its opposite corner; verify tests confirm roundness and identical behavior with and without Shift.

## 2. Selection-scoped mode state and Properties control

- [x] 2.1 Add transient resize/vertex mode state to `useMapSession`, resetting it on object changes, deselection, and drawing-tool changes; pass the state and setter to `LayerSidebar` and `MapBoard`; verify session tests cover each reset path.
- [x] 2.2 Add an accessible mode choice above object details for selected images, polylines, and polygons, defaulting to resize and absent for circles, points, and no selection; verify component tests cover visibility, keyboard operation, and default/reset behavior.

## 3. Map editor resize and vertex modes

- [x] 3.1 Update polyline and polygon editors to show four projected bounding-box handles plus the existing move handle in resize mode, and their stored vertices plus move handle in vertex mode; verify component tests cover handle counts, opposite-corner scaling, aspect locking, Shift override, and individual-vertex edits.
- [x] 3.2 Update image editing so resize mode locks the current bounds ratio by default and reads Shift during the drag to unlock it, while vertex mode preserves independent corner adjustment; verify component tests cover live bounds, committed bounds, modifier changes, and both modes.
- [x] 3.3 Add four-corner round resizing to selected circles while retaining their center move handle and omitting the mode choice; verify component tests cover all four corners and Shift-invariant roundness.
- [x] 3.4 Keep live Leaflet previews and sibling handles synchronized during resize and move drags, while retaining commit-on-drag-end persistence and the existing large-shape vertex limit; verify component tests cover live updates and final object updates.

## 4. Map interaction verification

- [x] 4.1 Verify resize, vertex, and move-handle drags leave the map center and zoom unchanged; add or update a map interaction test and suspend/restore map dragging during handle gestures only if marker event handling does not already keep the viewport stationary.
- [x] 4.2 Run the focused geometry and editor tests plus the project test suite and build; resolve failures and verify the OpenSpec change validates successfully.
