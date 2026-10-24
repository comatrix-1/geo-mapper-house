# Tasks

Implementation order follows `design.md`: the shared suppression util (D1) first, because every drag-end site depends on it; then the selection-instance key (D2) and the cursor variant (D3), which are independent of D1.

## 1. Trailing-click suppression (D1)

- [x] 1.1 Add `src/utils/suppressTrailingClick.ts` implementing the one-shot capture listener with the 0 ms disarm, and verify with a new `test/utils/suppressTrailingClick.test.ts` covering: a click dispatched after arming does not reach a listener registered on the container; the listener is removed after firing; the timer disarm leaves no armed handler when no click follows the gesture (`npx vitest run test/utils/suppressTrailingClick.test.ts`)
- [x] 1.2 Call the util from `beginHandleDrag`'s mouseup handler in `src/components/MapBoardEditable.tsx` so all bounding-box resize handles (image, circle, polyline, polygon) are covered, and verify the existing custom-drag tests still pass (`npx vitest run test/components/MapBoardEditable.test.tsx`)

## 2. Cover every native drag end

- [x] 2.1 Arm the suppression in `EditablePoint`'s `dragend` and verify a test asserting a point-marker drag arms it
- [x] 2.2 Arm it in the circle move handle's `dragend` in `EditableCircle` and verify a test asserting that drag arms it
- [x] 2.3 Arm it in the image center move handle and in the image's vertex-mode corner markers (`dragend`), and verify tests assert both arms it
- [x] 2.4 Arm it in the shared vertex/move drag ends used by `ShapeHandles` and in the polyline and polygon move handles, and verify tests assert a vertex drag and a whole-shape move drag each arm it for both shape types
- [x] 2.5 Confirm no drag-end site was missed by enumerating every `dragend` / `mouseup` in `src/components/MapBoardEditable.tsx` against the design's site list, and verify by adding the surviving gaps (if any) plus their assertions, or by recording in the change notes that the list is complete
  - Change note: the file holds exactly 8 `dragend` handlers (ShapeHandles vertex + centre, `EditablePoint`, circle move handle, image centre, image vertex-mode corners, polyline move, polygon move) and 1 custom-drag `mouseup` (`beginHandleDrag`); all 9 call `suppressTrailingClick()` and each is covered by a case in the `trailing-click suppression at drag end` suite. The list is complete.

## 3. Selection-scoped mode resets on every new selection (D2)

- [x] 3.1 Add the selection-instance sequence to `useMapSession`'s edit-mode owner key, bumped only when the incoming selection id differs from the current one, routed through the wrapped setter so both `setSelectedObjectId` and `selectObject` share it, and verify `npx tsc --noEmit` passes
- [x] 3.2 Update `test/hooks/use-map-session.test.ts`: flip "keeps the chosen mode when the same object is re-selected" to expect four-handle resize after a deselect/re-select of the same object, add a case for `A -> B -> A`, and add a case proving re-selecting an already-selected object keeps `vertices`; verify with `npx vitest run test/hooks/use-map-session.test.ts`
- [x] 3.3 Verify the reset stays render-derived (no effect calling a setter) by running `npx eslint src/hooks/use-map-session.ts` clean

## 4. Four-way move cursor on vertex handles (D3)

- [x] 4.1 Introduce the `HandleCursor = ResizeCursor | 'move'` boundary type in `src/components/Icons.tsx`, accept it in `createVertexIcon`, and add `.leaflet-marker-icon.geo-handle--move { cursor: move }` to `src/index.css`; verify the class name appears in the icon's rendered `className` via `npx vitest run test/components/MapBoardEditable.test.tsx`
- [x] 4.2 Pass `'move'` unconditionally from `ShapeHandles` and the image's vertex-mode corner markers, dropping their `getVertexResizeCursors` calls while leaving `CornerResizeHandles` directional; verify `npx vitest run test/utils/resizeCursor.test.ts` still passes unchanged (the util's contract is untouched)
- [x] 4.3 Re-express the two "directional resize cursors" cases in `test/components/MapBoardEditable.test.tsx` (they currently render with `geometryEditMode: 'vertices'`) so vertex mode expects `move` and a new resize-mode case keeps the directional cursors covered; verify with `npx vitest run test/components/MapBoardEditable.test.tsx`
- [x] 4.4 Confirm the non-draggable preview markers in `src/components/MapBoardEvents.tsx` still call `createVertexIcon()` with no cursor and therefore keep the pointer cursor, and verify by running `npx vitest run test/components/MapBoard.test.tsx` plus checking no `geo-handle--move` class is produced for preview markers

## 5. Integration checks

- [x] 5.1 Run `npx vitest run`, `npx tsc --noEmit` and `npx eslint src test` and confirm every test belonging to the files touched by groups 1-4 passes; report pre-existing failures outside this scope without fixing them
- [x] 5.2 With `npm run dev`, manually verify the three spec scenarios end to end: a corner resize released off the handle keeps the object selected; clicking empty background still deselects; deselecting a vertex-mode object and selecting it again opens in resize mode; vertex-mode handles show a four-way move cursor while resize-mode corners stay directional

## Workflow follow-up

- Archive the change and sync `map-object-geometry-editing` once the project's review requirements are met.
