# Proposal

## Why

Users can position and resize image overlays, but cannot align them by rotation. Adding rotation makes image placement more useful while preserving the familiar direct-manipulation workflow of an image editor.

## What Changes

- Add rotation for a selected map image by dragging outside its selection frame, hinted by a rotation cursor in the drag area, with a live angle readout and 15-degree snapping while Shift is held. The drag area keeps a keep-out around each corner so the resize handles always win near corners.
- Rotate around the image center and apply the rotation when the drag ends; no separate confirmation step is needed.
- Limit this change to rotation. Skew, distort, perspective, warp, and other transform operations are out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `map-object-geometry-editing`: Add rotation behavior for selected image overlays.

## Impact

- Image selection controls and map rendering in the editable map board.
- Persisted map-image geometry, which currently represents images with axis-aligned bounds.
