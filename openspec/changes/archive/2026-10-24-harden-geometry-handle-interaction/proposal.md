# Proposal

## Why

Handle gestures on the map fight the user: releasing a drag anywhere off the handle icon lets the browser's trailing `click` reach Leaflet's map handler, which clears the selection — so the object you just resized is suddenly deselected and its handles vanish. On top of that, the vertex-editing mode survives a deselect/re-select cycle (contradicting the existing spec's "clears the selection … a newly selected eligible object starts in four-handle resize mode"), and vertex handles show a two-sided resize arrow even though a vertex moves freely in any direction.

## What Changes

- **Selection persists through handle gestures.** After a resize, move or vertex drag — and after dragging a point marker — the object stays selected. Only an explicit deselection (clicking empty map background, switching to a drawing tool, or deleting the selected object) clears it. Fixes the trailing-click hole that exists for both drag systems (custom pointer drag and native `L.Draggable`).
- **Geometry editing mode resets on every new selection**, including re-selecting the same object after a deselect. The mode key gains a selection-instance identity, so a fresh selection always opens in four-handle resize; re-clicking an already-selected object (e.g. to re-focus it) keeps its chosen mode.
- **Vertex-mode handles show a four-way move cursor.** Resize-mode bounding-box corners keep their directional (axis/diagonal) cursors. Non-draggable preview dots are unchanged.

No breaking changes, no data-model or persistence changes: the editing mode remains transient, selection-scoped UI state that is never stored with the object.

## Capabilities

### New Capabilities

None — this change stays inside the existing geometry-editing capability's boundary.

### Modified Capabilities

- `map-object-geometry-editing`:
  - NEW requirement "Selection persists through handle gestures" — drags must not clear the selection.
  - MODIFIED requirement "Selection-scoped geometry editing mode" — reset to four-handle resize on each new selection, explicitly including re-selecting the same object after a deselect.
  - MODIFIED requirement "Individual vertex editing mode" — vertex handles present a four-way move cursor.
  - NEW requirement "Handle cursor affordance" — cursor communicates the degree of freedom a handle offers, per mode.

## Impact

- `src/hooks/use-map-session.ts` — selection-instance identity for the edit-mode owner key (derived during render, no `setState` in an effect: the repo's `react-hooks/set-state-in-effect` rule rejects the reset-in-effect pattern here).
- `src/components/MapBoardEditable.tsx` — both drag systems (`beginHandleDrag` and the native marker `dragend` sites) plus `ShapeHandles` and the image's vertex-mode corner markers.
- `src/components/MapBoardEvents.tsx` — the map `click` handler that clears the selection.
- `src/components/Icons.tsx` and `src/index.css` — move-cursor variant for vertex handles.
- Tests: `test/hooks/use-map-session.test.ts` (the "keeps the chosen mode when the same object is re-selected" expectation flips), `test/components/MapBoardEditable.test.tsx` (the "directional resize cursors" cases render in vertex mode and must expect `move`), plus new coverage for selection persistence.
- Depends on no new packages; Leaflet 1.9.4's `_findEventTargets` / `_draggableMoved` suppression is the constraint being worked around, not modified.
