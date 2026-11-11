# Proposal

## Why

Map image objects currently render at full opacity, making it difficult to compare an image overlay with the basemap or underlying map content. Users need to adjust each image independently while arranging multiple overlays.

## What Changes

- Add an opacity control for a selected image object.
- Persist each image's opacity with that object, with full opacity as the default for existing and newly created images.

## Capabilities

### New Capabilities

- `map-image-opacity`: Configure and retain opacity independently for each map image object.

### Modified Capabilities

None.

## Impact

The image object model, selected-object Properties panel, and image overlay rendering will be affected. Existing saved image objects must continue to render at full opacity when they have no opacity value.
