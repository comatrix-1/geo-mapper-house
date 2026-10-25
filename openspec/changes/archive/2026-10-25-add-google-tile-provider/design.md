# Design

## Context

The MapBoard component used OpenStreetMap tiles, which cap out around zoom 18. Users need levels 19-21 to read individual room layouts and roof structures. Google's `vt` tile endpoint serves satellite imagery to level 21 and is reachable by plain URL, with no account or API key.

`react-leaflet` was already integrated and the base layer was a single `TileLayer` in `src/components/MapBoard.tsx`, so the change is confined to that layer plus the container's `maxZoom`.

## Goals

- Swap the OpenStreetMap base layer for Google satellite imagery
- Support zoom levels 0-21 (up from the OSM default of 18)
- Require no new credentials or dependencies

## Non-Goals

- Do not add a tile-provider switcher to the UI
- Do not change existing map object editing functionality
- Do not modify core map interaction logic (pan, zoom, object editing)

## Decisions

### 1. Use Google satellite tiles over OpenStreetMap

**Rationale:** Google serves aerial imagery down to level 21, enough to make floor plans legible. OpenStreetMap tops out near 18-19 with less detail for this use case.

**Alternatives considered:**
- Mapbox: higher maximum zoom (22) but requires account registration and a `VITE_MAPBOX_TOKEN`, which the app would have to ship and document
- MapTiler: also supports high zoom, likewise token-gated
- Keep OpenStreetMap: insufficient zoom for the use case

### 2. Request the tile endpoint directly with `TileLayer`

**Rationale:** `https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}` works with the `TileLayer` already in use, given `subdomains={["mt0", "mt1", "mt2", "mt3"]}`. No wrapper component or extra package is needed.

**Alternatives considered:**
- `react-leaflet-google-layer`: pulls in a dependency to do what `TileLayer` already does, and was unused in the first cut of this change
- Official Google Maps Tile API with a key: adds a billing account and secret to the project's setup

### 3. Set maxZoom={21} on MapContainer and the tile layer

**Rationale:** Leaflet defaults to maxZoom 18, so the container has to raise the ceiling explicitly. 21 is the deepest zoom the endpoint serves; going higher would render blank tiles.

**Alternatives considered:**
- Dynamic maxZoom based on provider detection - more machinery than a single fixed provider warrants
- Omit maxZoom - leaves the app stuck at 18

## Risks / Trade-offs

- [Unofficial endpoint] → `vt/lyrs` is not a documented, SLA-backed API and could change or start requiring a key; the app would then need to move to the official Tile API or Mapbox
- [Terms of service] → embedding Google tiles outside the Maps API may be restricted for commercial deployments; verify before shipping publicly
- [No road or place labels] → satellite-only imagery loses the street names the OSM layer provided; `lyrs=y` (hybrid) overlays labels if needed
- [Attribution] → Google requires the attribution shown on the map
- [Existing projects] → saved maps reload against a different basemap, so any visual reference users had to OSM styling shifts

## Open Questions

- Should the base layer offer streets and satellite as toggle options, now that satellite is the only one?
- Is the unlabeled satellite view acceptable, or does the app need the hybrid `lyrs=y` variant?
