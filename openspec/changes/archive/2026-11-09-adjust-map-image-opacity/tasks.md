# Tasks

## 1. Image opacity data and rendering

- [x] 1.1 Add an optional normalized opacity value to `MapImage` and apply it to the raster overlay with a full-opacity fallback; verify overlay tests cover explicit and missing opacity values.
- [x] 1.2 Add regression coverage that saved workspace objects and exported/imported projects retain image opacity, while legacy image objects without the field still load at full opacity; verify the relevant persistence and file-import tests pass.

## 2. Image Properties control

- [x] 2.1 Add a labeled 0–100% range control to the selected image's Properties panel, display the current percentage, and send normalized opacity updates through the existing object update callback; verify the control updates the image value.
- [x] 2.2 Add Properties panel tests confirming the control appears for images, changes only the selected image, and reports 0% and 100% correctly; verify the focused component tests pass.
