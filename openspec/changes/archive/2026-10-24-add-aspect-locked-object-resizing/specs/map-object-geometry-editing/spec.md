# Spec Delta

## Purpose

Lets users resize map images and vector shapes predictably while retaining direct vertex editing when they need to adjust an irregular shape's geometry.

## ADDED Requirements

### Requirement: Selection-scoped geometry editing mode
The system MUST show a geometry editing mode choice in the Properties panel while an image, line, or polygon is selected. The choice MUST default to four-handle resize for each selection and MUST be hidden when no object is selected. Selecting a different object MUST reset the choice to four-handle resize. Points MUST retain their existing move behavior and MUST NOT show this choice. Circles MUST use round resizing without this choice.

#### Scenario: Selected editable object shows default mode
- **WHEN** the user selects an image, line, or polygon
- **THEN** the Properties panel shows the geometry editing mode choice with four-handle resize selected

#### Scenario: Mode choice is temporary to the selection
- **WHEN** the user changes the selected object or clears the selection
- **THEN** the prior editing mode is discarded, the choice is hidden when nothing is selected, and a newly selected eligible object starts in four-handle resize mode

#### Scenario: Point and circle selection
- **WHEN** the user selects a point or circle
- **THEN** no geometry editing mode choice is shown; a point retains its move behavior and a circle retains round resizing

### Requirement: Four-handle whole-object resizing
In four-handle resize mode, the system MUST show handles at the four corners of the selected object's bounding box and resize the entire object from the opposite bounding-box corner. This mode MUST apply to images, lines, polygons, and circles. A circle MUST remain round while resizing.

#### Scenario: Resize an irregular vector shape
- **WHEN** the user drags one of the four bounding-box handles of a line or polygon
- **THEN** the system scales all of its geometry from the opposite bounding-box corner

#### Scenario: Resize a circle
- **WHEN** the user drags one of the four bounding-box handles of a selected circle
- **THEN** the system resizes the circle from the opposite bounding-box corner while keeping it round

### Requirement: Aspect-ratio locking and Shift override
In four-handle resize mode, the system MUST preserve the selected image, line, or polygon's current bounding-box aspect ratio by default. Holding Shift during a resize MUST allow those objects' width and height to change independently. Shift MUST NOT change circle resizing; circles MUST remain round.

#### Scenario: Resize with aspect ratio locked
- **WHEN** the user resizes an image, line, or polygon without holding Shift
- **THEN** the object's bounding-box aspect ratio remains unchanged while the opposite corner stays fixed

#### Scenario: Resize with Shift held
- **WHEN** the user resizes an image, line, or polygon while holding Shift
- **THEN** the system allows width and height to change independently while keeping the opposite corner fixed

#### Scenario: Shift does not change circle resizing
- **WHEN** the user resizes a circle with or without holding Shift
- **THEN** the circle remains round and its resize behavior is unchanged by Shift

### Requirement: Individual vertex editing mode
In individual vertex editing mode, the system MUST expose each editable vertex of the selected image, line, or polygon as an independent drag handle. Dragging a handle MUST update only its corresponding vertex or image corner, preserving the existing individual-handle editing behavior.

#### Scenario: Edit one vector vertex
- **WHEN** the user drags a vertex handle in individual vertex editing mode
- **THEN** only that line or polygon vertex moves

#### Scenario: Edit one image corner
- **WHEN** the user drags an image corner in individual vertex editing mode
- **THEN** only that corner is independently adjusted, without enforcing the image's aspect ratio

### Requirement: Keep the map stationary during geometry edits
While the user drags a geometry resize or vertex handle, the system MUST move or resize only the selected object and MUST keep the map viewport stationary.

#### Scenario: Drag a geometry handle
- **WHEN** the user drags any resize or vertex handle
- **THEN** the selected object's geometry follows the drag and the map viewport does not pan
