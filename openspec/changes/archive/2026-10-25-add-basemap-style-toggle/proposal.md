# Proposal

## Why

The MapBoard base layer is hardcoded to Google satellite imagery (`lyrs=s`) after the `add-google-tile-provider` change. Users tracing features sometimes need the plain Google roadmap view instead — for example to read street names or check a reference against the vector map — and today they cannot switch.

## What Changes

- The MapBoard base layer becomes user-selectable between two Google tile styles: satellite (`lyrs=s`) and roadmap (`lyrs=m`).
- A new Leaflet control (bottom-left corner of the map) toggles between the two styles.
- The selected style is persisted in `localStorage` and restored on the next visit; satellite remains the default when no stored preference exists or the stored value is invalid.
- Attribution and `maxZoom={21}` behavior are unchanged (both endpoints serve imagery and roads up to zoom 21).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `google-tile-provider`: the requirement "Google satellite tile layer in MapBoard" changes from a fixed satellite base layer to a user-selectable satellite/roadmap base layer with a toggle control and a persisted preference (default satellite). Attribution and maxZoom requirements are untouched.

## Impact

- `src/components/MapBoard.tsx` — TileLayer URL becomes style-dependent; new toggle control mounted via `useMap`.
- A small localStorage read/write helper for the persisted preference (no storage usage exists in the app yet; this introduces the first key).
- `test/components/MapBoard.test.tsx` — new tests for switching, persistence, and default fallback.
- No new dependencies, no backend/Firestore changes, no changes to drawn objects or layers.
