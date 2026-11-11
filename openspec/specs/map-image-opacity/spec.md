# map-image-opacity Specification

## Purpose

Lets users adjust the transparency of each map image independently so image overlays can be compared with the basemap and other map content.

## Requirements

### Requirement: Adjust opacity for an individual map image
The system MUST provide an opacity control in the Properties panel when a map image is selected. The control MUST accept values from 0% through 100%, update the selected image on the map, and leave other images unchanged.

#### Scenario: Change selected image opacity
- **WHEN** the user adjusts the opacity control for a selected image
- **THEN** that image immediately renders at the chosen opacity and other images retain their opacity

#### Scenario: Set image fully transparent or opaque
- **WHEN** the user sets an image opacity to 0% or 100%
- **THEN** the image is respectively fully transparent or fully opaque

### Requirement: Persist image opacity with backward compatibility
The system MUST save an image's opacity with that image and restore it when loading saved data. Images without a stored opacity MUST be treated as fully opaque.

#### Scenario: Restore saved image opacity
- **WHEN** a saved workspace or exported project containing an adjusted image is loaded
- **THEN** the image is restored at its saved opacity

#### Scenario: Load an image without opacity
- **WHEN** a workspace or project contains an image with no opacity value
- **THEN** the image renders at 100% opacity
