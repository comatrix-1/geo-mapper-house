# Design

## Context

`MapImage` is part of the persisted `MapObject` union. `EditableImage` renders its raster inside an `SVGOverlay` at fixed opacity, and the selected object's Properties panel already sends live patches through the workspace persistence path. Project import and export serialize object data directly.

## Goals / Non-Goals

**Goals:**
- Store opacity independently on each image and update it immediately from the selected image's Properties panel.
- Keep existing image records and exported projects fully opaque when no opacity value is present.
- Fade only the raster overlay; selection frames and editing handles remain fully visible and interactive.

**Non-Goals:**
- Change opacity for an entire map layer or affect vector fill opacity.
- Add opacity controls to image creation or upload.

## Decisions

- Add an optional normalized opacity value (`0` to `1`) to `MapImage`. The UI displays a percentage and maps its range input to that value, consistent with Leaflet opacity and the existing layer fill-opacity control. Treat an absent value as `1`; this preserves older Firestore objects and project files without a data migration.
- Place the range control in the selected image's Properties panel. Reuse the panel's existing object update callback so changes render immediately and follow the normal object save path. A layer-level setting would change unrelated images together and would not meet the per-image requirement.
- Pass the image's opacity, or `1` when absent, to the `SVGOverlay`. The overlay contains only the raster, so the selected image's sibling frame and handles do not fade.
- Keep project import/export unchanged. Since they serialize whole map objects, the optional field will round-trip automatically; legacy objects continue to receive the full-opacity fallback at render time.

## Risks / Trade-offs

- [Rapid slider changes may trigger frequent object saves] -> Use the existing update and persistence path; if it becomes noisy in practice, persistence throttling can be considered separately without changing the opacity contract.
- [Opacity zero makes an image invisible and harder to select on the map] -> Keep the selected object's Properties control available and let users restore opacity there; layer sidebar selection remains available.
