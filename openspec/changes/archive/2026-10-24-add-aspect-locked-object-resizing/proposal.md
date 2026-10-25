# Proposal

## Why

Selected shapes currently expose every stored vertex as an independent drag handle, making routine whole-object resizing awkward and distorting objects unintentionally. A predictable four-handle resize mode with an explicit vertex-editing alternative will make object editing easier while keeping map navigation stable.

## What Changes

- Add a selection-scoped geometry editing mode choice to the Properties panel for images, lines, and polygons, visible only while one of those objects is selected and defaulting to four-handle resize for each selection.
- In resize mode, show four handles at the object's bounding-box corners and resize from the opposite corner. Preserve aspect ratio by default; holding Shift unlocks it for images, polygons, and lines.
- Keep circles round during resize; Shift does not change circle resizing.
- Leave points with their existing move behavior; they do not expose the geometry editing mode choice.
- Provide a vertex-editing mode that restores independent handles for each stored vertex.
- Keep the map viewport stationary while a resize or vertex handle is dragged.

## Capabilities

### New Capabilities

- `map-object-geometry-editing`: Selection-scoped resize and vertex-editing behavior for map objects.

### Modified Capabilities

None.

## Impact

- `MapBoardEditable` and geometry utilities for whole-shape scaling and live handle movement.
- `MapBoard` selection state and the Properties panel for temporary editing-mode state and controls.
- Tests for geometry transforms, mode visibility/defaults, modifier-key behavior, and stationary map interaction.
- Existing serialized object geometry remains the persisted source of truth; circle resize remains represented by its current center and radius.
