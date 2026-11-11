# Spec Delta

## ADDED Requirements

### Requirement: Rotate selected image overlays
The system MUST let users rotate a selected image by dragging outside its selection frame around the image center. The current angle MUST be shown during the drag, Shift MUST snap rotation to 15-degree increments, and releasing the drag MUST apply the rotation immediately while keeping the image selected.

#### Scenario: Rotate an image around its center
- **WHEN** the user drags outside a selected image's frame to rotate it
- **THEN** the image rotates around its center and the angle readout updates during the drag

#### Scenario: Snap rotation while holding Shift
- **WHEN** the user rotates an image while holding Shift
- **THEN** the rotation snaps to 15-degree increments

#### Scenario: Apply rotation on release
- **WHEN** the user releases the pointer after rotating an image
- **THEN** the rotation is applied immediately without a separate confirmation step, and the image remains selected

#### Scenario: Cursor signals a rotatable image
- **WHEN** the user hovers just outside a selected image's frame, over the area where a rotation drag begins
- **THEN** the cursor indicates the image can be rotated

#### Scenario: Corner presses stay with resize
- **WHEN** the user presses near a corner of a selected image's frame
- **THEN** the press does not start a rotation

#### Scenario: Drag ending outside the window
- **WHEN** the user ends a rotation drag outside the window
- **THEN** the gesture ends at its last seen angle instead of staying armed, and later pointer moves do not keep rotating the image
