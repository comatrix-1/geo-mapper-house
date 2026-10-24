# Design

## Context

`MapBoard` renders selected objects through type-specific editors. Polylines and polygons currently show a handle for every stored vertex plus a center move handle; circles show only a center move handle; images show a center move handle and four independently draggable bounds corners. `LayerSidebar` renders `ObjectDetailsPanel` for the selected object, keyed by object ID. Selection and drawing interaction state already live in `useMapSession`.

See `proposal.md` for motivation and `specs/map-object-geometry-editing/spec.md` for the behavior contract.

## Goals / Non-Goals

**Goals:**

- Share one selection-scoped edit mode between the Properties panel and the map editors.
- Reuse the current live Leaflet layer updates and commit geometry through the existing object update path.
- Keep all geometry serializable in the existing object variants; do not add an edit-mode field to saved objects.

**Non-Goals:**

- Changing the point marker's move behavior.
- Adding arbitrary image perspective transforms or changing image storage.
- Changing layer selection, map focus, or drawing workflows.

## Decisions

1. **Keep the edit mode in map-session UI state.** Add a temporary `resize`/`vertices` mode alongside selection in `useMapSession`, pass it to the Properties panel and `MapBoard`, and reset it whenever the selected object changes or clears. This keeps the choice available to both sibling UI surfaces without persisting it in map data. Local state only in `ObjectDetailsPanel` was considered, but the map editors also need the value; a new persisted object property was rejected because the choice lasts only for the current selection.

2. **Offer the selector only for images, polylines, and polygons.** These types support either four-handle resizing or independent corner/vertex edits. Circles always use round four-handle resizing, and points retain their current move behavior. This avoids presenting a mode that has no meaningful alternate geometry for circles or points.

3. **Scale geometry in Leaflet's projected map plane.** Build the four handles from the selected geometry's projected bounding box at the current zoom. Dragging a corner transforms every projected vertex about the opposite bounding-box corner, then converts the results back to geographic coordinates. Use a uniform scale by default to retain the starting width-to-height ratio; when Shift is held, compute the horizontal and vertical scale factors independently. This is more visually predictable than scaling latitude and longitude directly. For images, apply the same operation to the projected southwest/northeast bounds. Keep vertex editing on the existing direct vertex-drag path; image corner edits remain free of the aspect constraint in that mode.

4. **Resize circles through their projected bounds while retaining center/radius storage.** Show four corners of the projected circle bounds. Keep the opposite bound corner fixed, constrain the new bounds to equal width and height, set the circle center to the bounds midpoint, and derive the new meter radius using the map's distance calculation. Shift is ignored for circles. This preserves the existing `MapCircle` representation and avoids an ellipse migration.

5. **Keep live previews and persistence at the current boundary.** Update Leaflet paths or overlays and sibling handles during marker `drag` events, then call the existing `onUpdate` path at `dragend`, as the editors already do. Keep the draggable handles non-bubbling so map clicks do not clear selection; verify that the viewport does not pan during resize, vertex, or move-handle drags and explicitly suspend map dragging during a handle gesture only if Leaflet's current marker behavior does not suffice.

6. **Place the mode control above object details.** Add it to the existing Properties panel. The object details component is keyed by ID, while the mode itself lives in map-session state so both the panel control and map handle rendering stay synchronized. Reset selection mode in every selection path, including map clicks, sidebar selection, tool changes, and deselection.

## Risks / Trade-offs

- **Large imported shapes can have many vertices.** Keep the existing vertex-edit limit for individual editing; four bounding-box handles remain available in resize mode so large shapes can still be resized.
- **Degenerate or very thin bounds can make corner positions coincide or aspect ratios undefined.** Guard zero-width/zero-height geometry in the shared transform and cover horizontal/vertical lines in the geometry cases; preserve a valid, non-inverted object rather than dividing by zero.
- **Modifier-key state can be lost if only read at drag start.** Read Shift state throughout the drag so the user can hold or release it while resizing; include the modifier in drag events or track keyboard state for the active gesture.
- **A handle drag could pan the map if event propagation changes.** Retain non-bubbling draggable markers and verify viewport stability in the map interaction tests; suspend and restore map dragging around the gesture only if required.

## Migration Plan

No persisted object migration is needed. The editing mode is transient UI state, and existing object geometry fields remain unchanged. Rollback consists of removing the transient mode and transform paths; saved map data remains compatible.
