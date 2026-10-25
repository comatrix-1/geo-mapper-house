# Spec Delta

## ADDED Requirements

### Requirement: Basemap style preference is persisted

The system SHALL persist the selected basemap style in the browser's local storage and restore it when the application is next opened.

#### Scenario: Preference restored on reload

- **WHEN** the user reloads or reopens the application after choosing a basemap style
- **THEN** the base layer renders in the stored style

#### Scenario: Missing or invalid preference falls back to satellite

- **WHEN** the application is opened and local storage holds no basemap style, or holds a value that is not a known style
- **THEN** the base layer renders in the satellite style

### Requirement: Accessible basemap style toggle control

The system SHALL present a control on the map that lets the user select the basemap style, identifies which style is currently active, and responds to keyboard interaction.

#### Scenario: Toggle switches the active style

- **WHEN** the user activates the roadmap option in the control while satellite is displayed
- **THEN** the base layer switches to the roadmap style and the control marks roadmap as the active style

#### Scenario: Style choice does not disturb the view

- **WHEN** the user switches the basemap style
- **THEN** the map center and zoom level remain unchanged

## MODIFIED Requirements

### Requirement: Google satellite tile layer in MapBoard

The system SHALL render the MapBoard base layer from a Google tile endpoint in the user-selected style, one of satellite (`lyrs=s`) or roadmap (`lyrs=m`), replacing the OpenStreetMap provider. Satellite is the style shown when the user has made no valid preference (see "Basemap style preference is persisted").

#### Scenario: MapBoard renders satellite imagery

- **WHEN** the MapBoard component is rendered and the selected style is satellite
- **THEN** the base layer requests tiles from `https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}` across the `mt0`-`mt3` subdomains

#### Scenario: MapBoard renders roadmap imagery

- **WHEN** the MapBoard component is rendered and the selected style is roadmap
- **THEN** the base layer requests tiles from `https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}` across the same subdomains

#### Scenario: Provider requires no credentials

- **WHEN** the application starts with no tile-provider key configured
- **THEN** the base layer still loads, because the tile endpoint is requested by URL without an access token
