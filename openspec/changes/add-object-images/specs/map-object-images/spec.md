# Spec Delta

## Purpose

Lets users attach reference photos to any map object so the images live with the object in the Properties panel instead of cluttering the map as georeferenced overlays, with storage cleanup following the object's lifecycle.

## ADDED Requirements

### Requirement: Attach images to a selected map object
The system MUST provide an Images section in the Properties panel for any selected object, with an Add control that opens a multi-file picker accepting image files. Each attached image MUST be stored as a persistent attachment on the object, with a thumbnail shown in a small grid in the Images section. Attachment metadata MUST be optional on the base object type so previously saved objects without attachments load unchanged.

#### Scenario: Add images to an object
- **WHEN** the user selects an object, opens the file picker from the Add control, and chooses one or more image files
- **THEN** each valid file uploads, and all uploaded images appear as thumbnails in the object's Images section and persist with the object

#### Scenario: Objects without attachments load unchanged
- **WHEN** saved data contains an object with no stored images
- **THEN** the object loads and renders normally with an empty Images section

### Requirement: Validate the whole file batch before any upload
The system MUST validate every chosen file against the shared image rules (image type, 10 MB maximum) before uploading any of them. If any file fails validation, the entire batch MUST be rejected with an error naming the offending file(s), and no file from the batch MUST be uploaded.

#### Scenario: Batch rejected on an invalid file
- **WHEN** the user picks a batch where one file exceeds 10 MB or is not an image
- **THEN** no file from the batch uploads and an error message names the offending file(s)

#### Scenario: Valid batch proceeds
- **WHEN** the user picks a batch where every file is an image of 10 MB or less
- **THEN** the upload of the batch begins

### Requirement: Keep successful uploads when some uploads fail
The system MUST attach every successfully uploaded file from a batch, even if other files in the same batch fail to upload. Upload failures MUST surface an error and MUST NOT prevent the successful attachments from being added.

#### Scenario: Partial upload failure
- **WHEN** a valid batch is uploaded and one file fails during upload while the others succeed
- **THEN** the successful files are attached to the object and the failure is surfaced as an error

#### Scenario: Retry a failed file
- **WHEN** the user re-picks a file that failed to upload earlier
- **THEN** the file uploads and is attached like any other image

### Requirement: View the full image from a thumbnail
Each attachment thumbnail MUST open the full image when activated, without requiring the map to change.

#### Scenario: Open a thumbnail
- **WHEN** the user activates an attachment thumbnail
- **THEN** the full image opens in a new tab

### Requirement: Remove an attachment
The system MUST let the user remove an attachment from a selected object via a remove control on its thumbnail. The removal MUST update the object first, and cleanup of the removed file's storage MUST be best-effort afterwards: a storage cleanup failure MUST surface an error but MUST NOT block or undo the removal.

#### Scenario: Remove an attachment
- **WHEN** the user activates the remove control on a thumbnail
- **THEN** the image is removed from the object's Images section and persists as removed

#### Scenario: Storage cleanup failure on remove
- **WHEN** the removed attachment's storage cleanup fails
- **THEN** the removal still stands and an error is surfaced

### Requirement: Storage cleanup on object deletion
When a map object is deleted, the system MUST best-effort delete the storage files of attachments the signed-in user owns before the object record is deleted. A cleanup failure for an attachment MUST be surfaced but MUST NOT prevent the object deletion. The existing strict storage-first behavior for image overlay files MUST be unchanged.

#### Scenario: Delete an object with attachments
- **WHEN** the user deletes an object that owns attached image files
- **THEN** the owned attachment files are removed from storage and the object is deleted

#### Scenario: Attachment cleanup failure on object deletion
- **WHEN** deleting an object whose attachment storage cleanup fails
- **THEN** the object is still deleted and the failure is surfaced

### Requirement: Signed-out users can view but not modify attachments
When signed out, the system MUST still render existing attachment thumbnails, but MUST disable the Add control with a sign-in hint and MUST NOT allow removing attachments.

#### Scenario: Signed-out user views attachments
- **WHEN** a signed-out user selects an object that has attachments
- **THEN** the thumbnails render and the Add control is disabled with a sign-in hint, and no remove controls are offered

### Requirement: Persist attachments with saved data
The system MUST save each object's attachment list with the object and restore it when loading saved workspaces and exported/imported project files.

#### Scenario: Restore saved attachments
- **WHEN** a saved workspace or exported project containing an object with attachments is loaded
- **THEN** the object's attachments are restored with their images
