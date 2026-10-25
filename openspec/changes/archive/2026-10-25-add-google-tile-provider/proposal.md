# Proposal

## Why

The default OpenStreetMap provider limits zoom to level 18, which is insufficient for users who need to see individual house room layouts. At zoom 18 building footprints are visible but interior detail is not. Google's satellite tile endpoint serves imagery down to level 21 and requires no account or API key, so it meets the zoom requirement without adding a secret to the project's configuration.

## What Changes

- Replace the OpenStreetMap `TileLayer` in MapBoard with the Google satellite endpoint
- Set `maxZoom={21}` on the MapContainer and the tile layer
- Update the tile attribution from OpenStreetMap to Google

## Capabilities

### New Capabilities

- `google-tile-provider`: Google satellite tiles up to zoom level 21, enabling detailed architectural and floor plan viewing.

### Modified Capabilities

- (none - no existing spec requirements changing)

## Impact

- **MapBoard component** (`src/components/MapBoard.tsx`): base `TileLayer` switches from OpenStreetMap to Google satellite
- **Tile layer URLs**: `{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` becomes `https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}` with `mt0`-`mt3` subdomains
- **maxZoom**: raised from 18 (OSM default) to 21, the ceiling of the satellite imagery
- **Dependencies**: none. No access token is required and no tile plugin is added
- **Attribution**: OpenStreetMap copyright replaced by Google
