# Design

## Context

See `proposal.md - Why` for motivation. The constraints that shape the approach:

**The deselection is a browser/Leaflet interaction, not app logic.** No code path in `App.tsx`, `use-workspace.ts` or `MapBoard.tsx` clears the selection when geometry changes. The chain is:

```
 mousedown on handle icon ................ mouseup over map pane
            |                                      |
            v                                      v
   [marker <div>]                        [tile / container]
            \                                  /
             v     browser dispatches click on  v
                nearest COMMON ANCESTOR  =  map container
                            |
                            v
     Leaflet: _findEventTargets walks UP from e.target
     stamp(container) -> the Map itself (registered in _initEvents)
     _draggableMoved(map)?  map.dragging never started -> false
                            |
                            v
     map 'click' fires -> MapEvents handler, drawingMode 'none'
                            -> setSelectedObjectId(null)
```

Leaflet does suppress the click after a drag — `_findEventTargets` breaks when `_draggableMoved(target)` — but only when the click's target chain still passes through the dragged layer's element. That is exactly the "released on the handle" case, which is why the bug reads as intermittent.

Both drag systems are affected: `beginHandleDrag` (the custom pointer drag used by all bounding-box resize handles) and native `L.Draggable` markers (point markers, circle center/corners, image center and vertex-mode corners, polyline/polygon vertices and move handles).

**`preventDefault` is already in play and does not help.** `beginHandleDrag` calls `Leaflet.DomEvent.stop(domEvent)` on mousedown, which includes `preventDefault()`, yet the trailing `click` is still dispatched. So the fix cannot be "cancel the mousedown harder".

**Existing lint constraint in this repo.** `react-hooks/set-state-in-effect` is enabled, so selection-scoped state must not be re-synced by an effect calling a setter; `use-map-session.ts` already derives `geometryEditMode` during render from an owner key.

## Goals / Non-Goals

**Goals:**
- One gesture-suppression mechanism that both drag systems can use, with no state shared between the map and the handles.
- Selection identity that distinguishes "a new selection" from "the same selection continued", without a second render pass.
- Cursor choice derived from the mode a handle is rendered in, so the two modes cannot drift.

**Non-Goals:**
- Changing panning/zooming behaviour — Leaflet already suppresses the click after a map pan.
- Adding Escape-key or other new deselection affordances; the spec's explicit-deselection list (background click, tool switch, delete) stays as is.
- Changing which handles exist, where they sit, or the aspect-lock math — `geometryResize.ts`, `imageOverlay.ts` and `resizeCursor.ts` keep their contracts.
- Persisting the editing mode with the object (it stays transient UI state).

## Decisions

### D1: Suppress the trailing click with a one-shot capture listener armed at drag end

At each drag end, register a single capture-phase `click` listener on `document` that calls `stopPropagation()` and removes itself. Because the browser dispatches the `click` only after the `mouseup` / `dragend` handlers return, a listener armed during drag end is guaranteed to run first; capture on `document` precedes Leaflet's bubble-phase listener on the container, so the map `click` never fires. A `setTimeout(..., 0)` disarm covers the one case where no click follows the gesture (release outside the window), so the listener can never stay armed long enough to eat a later, genuine deselect click.

Implemented as one small util (e.g. `src/utils/suppressTrailingClick.ts`) called from `beginHandleDrag`'s mouseup and from every native `dragend`, so all sites share one behaviour and one test.

Alternatives considered:
- **Session-level "a drag just ended" flag consulted by the map click handler.** Covers every current and future drag site from one place, but it is shared mutable state with a lifetime problem: unless it is also cleared on the next mousedown it silently swallows the user's next real deselect click. Rejected for the self-clearing property of the one-shot listener; remains the fallback if any individual `dragend` site turns out to be un-wireable.
- **`_leaflet_disable_events` / `disableClickPropagation` on handle elements.** Insufficient by construction: those only suppress clicks whose target chain enters the element, i.e. the case that already works.
- **Replicating Leaflet's `_draggableMoved` check app-side.** Requires reading a private map field (`_targets`) and still has to identify which layer moved; more coupling than arming a listener.

### D2: Give the edit-mode owner key a selection-instance sequence

`useMapSession` keeps the existing derive-during-render pattern and extends the owner identity with a monotonic sequence that is bumped **only when the incoming selection id differs from the current one**:

```
 owner = `${drawingMode}:${selectedObjectId ?? ''}:${selectionSeq}`

 A -> null -> A   seq bumps on null->A    -> resize   (reset)
 A -> B     -> A  seq bumps at each change -> resize   (reset)
 A -> A (re-click / re-focus)               -> keeps its chosen mode
 A -> tool switch                            -> selection cleared, id differs -> reset
```

The bump happens in the wrapped setter (an event-handler path), never during render, so it does not reintroduce the `set-state-in-effect` violation. Both selection entry points (`setSelectedObjectId` used by map clicks and App's delete path, `selectObject` used by the sidebar) funnel through the wrapper.

Alternatives considered: resetting `editChoice` in an effect (lint violation, and the repo's known pitfall); resetting inside each click handler (`MapBoard` calls `setSelectedObjectId` directly, so paths are easy to miss); bumping on every setter call (would reset the mode when the user re-clicks an already-selected object to re-focus it, which the spec now forbids).

### D3: Model the cursor as a presentation variant, not a resize axis

`resizeCursor.ts` keeps `ResizeCursor = 'ns' | 'ew' | 'nesw' | 'nwse'` and `getVertexResizeCursors()` unchanged — it describes resize geometry, and widening it to include `move` would let its return type claim a "resize direction" that isn't one. The handle cursor type becomes `HandleCursor = ResizeCursor | 'move'` at the `createVertexIcon` boundary, and a `.leaflet-marker-icon.geo-handle--move { cursor: move }` rule joins the existing four. The `.leaflet-marker-icon` prefix stays: it is what outranks Leaflet's `.leaflet-interactive { cursor: pointer }`.

Vertex-mode sites (`ShapeHandles`, the image's native corner markers) pass `'move'` unconditionally and stop computing directions; `CornerResizeHandles` keeps the memoised `getVertexResizeCursors` call. Side effect: the `null` "no meaningful direction" result for a degenerate bounding box simply cannot occur in vertex mode any more.

The bare `createVertexIcon()` calls in `MapBoardEvents.tsx` (drawing-preview dots, circle radius preview) are deliberately untouched — those markers are not draggable, so `pointer` stays correct.

## Risks / Trade-offs

- **D1 is wired at several sites, so a drag family could be missed.** Mitigation: the site list is explicit in `tasks.md` (point marker, circle move + corners, image center + vertex corners, polyline/polygon vertices + move handles, `beginHandleDrag`), the shared util keeps each call to one line, and a test asserts selection survival per family rather than one aggregate case.
- **A one-shot listener that never fires leaves a stale capture handler.** Mitigated by the 0 ms disarm; the trailing click always lands in the same task or microtask chain, well before a timer callback.
- **Suppressing the click also suppresses double-click-to-finish during drawing.** Not a conflict: drawing modes clear the selection on entry (`setMode`) and handles only exist for a selected object in `drawingMode === 'none'`.
- **D2 changes a locked-in expectation.** `test/hooks/use-map-session.test.ts` currently asserts the opposite behaviour ("keeps the chosen mode when the same object is re-selected"); it must be flipped, and the two "directional resize cursors" cases in `MapBoardEditable.test.tsx` render with `geometryEditMode: 'vertices'` and must be re-expressed — one of them needs a resize-mode variant so directional cursors stay covered after the change.
- **Trade-off of D1 over D-alt:** a per-gesture listener is slightly more machinery at each drag end than one flag check in the click handler, in exchange for no cross-component state and no window in which a legitimate deselect click is lost.
