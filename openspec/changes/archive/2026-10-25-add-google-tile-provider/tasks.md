# Tasks

## 1. Configuration

- [x] 1.1 Confirm the Google tile endpoint needs no access token, so `.env.example` stays unchanged
- [x] 1.2 Verify `react-leaflet` `TileLayer` accepts custom `maxZoom` and `subdomains` props

## 2. Mapboard TileLayer Update

- [x] 2.1 Replace the OpenStreetMap `TileLayer` in `src/components/MapBoard.tsx` with `https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}` and `mt0`-`mt3` subdomains
- [x] 2.2 Set `maxZoom={21}` on both the MapContainer and the tile layer
- [x] 2.3 Update the attribution from OpenStreetMap to Google

## 3. Testing

- [x] 3.1 Run the MapBoard tests: `npx vitest run test/components/MapBoard.test.tsx test/components/MapBoardEditable.test.tsx` - 62 passed
- [x] 3.2 Load the app with no tile-provider key and confirm satellite tiles render (16-30 tiles, 0 failed)
- [x] 3.3 Zoom in to level 21 and confirm imagery of individual rooftops is legible
- [x] 3.4 Confirm the zoom control stops at level 21

## 4. Workflow follow-up

- [x] Archive the change under `openspec/changes/archive/`
- [ ] Re-run `openspec` validation for the `add-google-tile-provider` change
