# Spec Delta

## ADDED Requirements

### Requirement: Selection persists through handle gestures
While an object is selected, the system MUST keep it selected when the user finishes any handle gesture on it — bounding-box resize, whole-object move, individual vertex or image-corner drag, or point-marker drag. The selection MUST change only when the user explicitly deselects: clicking empty map background, picking a drawing tool, or deleting the selected object.

#### Scenario: Release a drag away from the handle
- **WHEN** the user releases a pressed handle at a screen position outside that handle's icon
- **THEN** the object remains selected and its handles stay visible at the new geometry

#### Scenario: Finish a move or vertex drag
- **WHEN** the user finishes a whole-object move drag, an individual vertex drag, or a point-marker drag
- **THEN** the object remains selected

#### Scenario: Explicit deselection still clears the selection
- **WHEN** the user clicks empty map background after finishing a gesture
- **THEN** the selection is cleared and the handles disappear

### Requirement: Handle cursor affordance by editing mode
The system MUST use a cursor that matches a handle's freedom of movement: individual vertex and image-corner handles in vertex editing mode MUST show a four-way move cursor, and bounding-box resize handles MUST show the cursor of the axis or diagonal along which that handle resizes. Handles that are not draggable MUST NOT show a move or resize cursor.

#### Scenario: Hover a vertex editing handle
- **WHEN** the user hovers over a line or polygon vertex handle, or an image corner handle in vertex editing mode
- **THEN** the cursor is a four-way move cursor

#### Scenario: Hover a bounding-box resize handle
- **WHEN** the user hovers over a bounding-box handle in four-handle resize mode
- **THEN** the cursor indicates the direction that handle resizes along, and is not a four-way move cursor

#### Scenario: Non-draggable preview markers
- **WHEN** the user is placing points for a line, polygon, or ruler measurement
- **THEN** the preview markers keep the default pointer cursor

## MODIFIED Requirements

### Requirement: Selection-scoped geometry editing mode
The system MUST show a geometry editing mode choice in the Properties panel while an image, line, or polygon is selected, and MUST hide it when nothing is selected. Every new selection MUST start in four-handle resize — including re-selecting the same object after a deselection — while re-selecting an already-selected object MUST keep its chosen mode. Points MUST keep their move behavior and MUST NOT show this choice; circles MUST use round resizing without it.

#### Scenario: Selected editable object shows default mode
- **WHEN** the user selects an image, line, or polygon
- **THEN** the Properties panel shows the geometry editing mode choice with four-handle resize selected

#### Scenario: Mode choice is temporary to the selection
- **WHEN** the user changes the selected object or clears the selection
- **THEN** the prior editing mode is discarded, the choice is hidden when nothing is selected, and a newly selected eligible object starts in four-handle resize mode

#### Scenario: Re-selecting the same object after a deselection
- **WHEN** the user deselects an object that was in vertex editing mode and later selects that same object again
- **THEN** the choice is shown with four-handle resize selected and the prior vertex mode is discarded

#### Scenario: Re-selecting the currently selected object
- **WHEN** the user selects an object that is already selected
- **THEN** its chosen editing mode is kept

#### Scenario: Point and circle selection
- **WHEN** the user selects a point or circle
- **THEN** no geometry editing mode choice is shown; a point retains its move behavior and a circle retains round resizing
