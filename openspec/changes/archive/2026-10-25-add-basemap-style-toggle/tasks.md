# Tasks

## 1. Test scaffolding and style module

- [x] 1.1 Extend the react-leaflet mock in `test/components/MapBoard.test.tsx` so `TileLayer` renders `<div data-testid="basemap-tile-layer" data-url={url} />`; verify the existing MapBoard tests still pass (`npm test`) with the mock change.
- [x] 1.2 Implement `src/utils/basemapStyle.ts` - key `geo-mapper:basemap-style`, a `satellite -> lyrs=s` / `roadmap -> lyrs=m` style map with URL builder, parse-with-satellite-fallback, and a guarded serializer; verify with unit tests covering valid round-trip, unknown value, missing key, and a `localStorage` whose access throws.

## 2. MapBoard integration

- [x] 2.1 Add the style state and persistence to `MapBoard`: `useState` lazy-initialized from `localStorage` via the parse helper, `TileLayer` `url` derived from the style map, effect writing the serialized style back with failures swallowed. Verify with MapBoard tests: default renders `lyrs=s` when storage is empty or holds an unknown value; selecting roadmap persists and a remount renders `lyrs=m`.
- [x] 2.2 Implement the basemap toggle as an `L.Control` mounted through a `useMap` controller inside `MapContainer`: bottomleft position, two `<button>` segments (Road / Satellite), active style marked, click switches style; added on mount and removed on unmount. Verify with MapBoard tests: activating roadmap flips the `TileLayer` `data-url` to `lyrs=m` and marks roadmap as the active option.

## 3. Browser verification

- [x] 3.1 Check the running app in a browser (start dev server): the control sits bottom-left clear of the sidebar rail, switching reloads tiles in place without moving center/zoom, and the choice survives a page reload. If tiles do not react to the `url` prop change, apply the `key={style}` fallback from design.md decision 4 and re-verify.
