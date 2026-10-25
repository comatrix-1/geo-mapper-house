# google-tile-provider Specification

## Purpose

Replaces the default OpenStreetMap tiles with Google satellite imagery, letting users view the map up to zoom level 21 so individual building layouts and roof structures are legible.

## ADDED

### Requirement: Google satellite tile layer in MapBoard

The system SHALL render the MapBoard base layer from the Google satellite tile endpoint, replacing the OpenStreetMap provider.

#### Scenario: MapBoard renders satellite imagery

- **WHEN** the MapBoard component is rendered
- **THEN** the base layer requests tiles from `https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}` across the `mt0`-`mt3` subdomains

#### Scenario: Provider requires no credentials

- **WHEN** the application starts with no tile-provider key configured
- **THEN** the base layer still loads, because the tile endpoint is requested by URL without an access token

### Requirement: Attribution for the tile provider

The system SHALL attribute the base layer to Google in the map controls.

#### Scenario: Attribution displayed

- **WHEN** the MapBoard component is rendered
- **THEN** the tile layer attribution reads "Google contributors"

### Requirement: maxZoom set to 21

The system SHALL set `maxZoom={21}` on both the MapContainer and the tile layer, matching the ceiling of the satellite imagery.

#### Scenario: User can zoom past the OpenStreetMap ceiling

- **WHEN** the user zooms in beyond level 18
- **THEN** the map continues to zoom and renders satellite detail up to level 21

#### Scenario: Map does not exceed zoom level 21

- **WHEN** the user attempts to zoom beyond level 21
- **THEN** the map respects the maxZoom boundary and does not zoom further
