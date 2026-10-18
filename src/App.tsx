import React, { useRef, useState } from 'react';
import type * as L from 'leaflet';
import MapBoard from './components/MapBoard';
import LayerSidebar from './components/LayerSidebar';
import Toolbar from './components/Toolbar';
import AuthWidget from './components/AuthWidget';
import MapHintBanner from './components/MapHintBanner';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { saveProjectToFile, loadProjectFromFile } from './utils/fileImporter';
import {
  saveObject,
  uploadMapImage,
  deleteMapImage,
} from './utils/firebase';
import {
  validateImageFile,
  getImageDimensions,
  createImageBounds,
} from './utils/imageOverlay';
import type { MapImage } from './types';
import { useAuthUser } from './hooks/use-auth-user';
import { useWorkspace } from './hooks/use-workspace';
import { useMapSession } from './hooks/use-map-session';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Composition root: wires the app's subsystems together and owns layout only.
 * - useAuthUser:   Firebase auth session (observer)
 * - useWorkspace:  layers/objects state + Firestore persistence (facade)
 * - useMapSession: drawing/selection/ruler interaction rules
 * Cross-domain rules (e.g. deleting the selected object clears the selection)
 * are coordinated here rather than inside any single subsystem.
 */
const App: React.FC = () => {
  const user = useAuthUser();
  const workspace = useWorkspace(user?.uid ?? null);
  const session = useMapSession(workspace.layers.length > 0);

  // Objects can only be drawn into a layer, so the shape tools stay off while
  // the workspace is empty. The ruler measures without creating anything.
  const canDraw = workspace.layers.length > 0;

  // File export needs no state change; file load is policy (confirm before the
  // destructive bulk overwrite). Both delegate state changes to the workspace.
  const handleSaveProject = () => saveProjectToFile(workspace.layers, workspace.objects);

  const handleLoadProject = async (file: File) => {
    try {
      const { layers, objects } = await loadProjectFromFile(file);
      if (confirm('Loading a project file will overwrite your local view. \n\nNote: If you are logged in, this will perform a bulk overwrite of your cloud data. Continue?')) {
        workspace.replaceAll(layers, objects);
      }
    } catch (err) {
      alert('Failed to load project: ' + err);
    }
  };

  const handleObjectDelete = (id: string) => {
    workspace.deleteObject(id);
    if (session.selectedObjectId === id) {
      session.setSelectedObjectId(null);
    }
  };

  // Image upload is orchestrated here (not in MapBoard) so the signed-in
  // check, validation, storage, Firestore save, and orphan cleanup are one
  // atomic flow. The map instance is supplied by MapBoard via onMapReady so
  // the initial bounds can be computed from the live viewport.
  const mapRef = useRef<L.Map | null>(null);
  const [imageError, setError] = useState<string | null>(null);
  const handleMapReady = (map: L.Map) => {
    mapRef.current = map;
  };

  const handleImageFileSelected = async (file: File) => {
    // Clear any previous image error so a fresh attempt starts clean.
    setError(null);

    if (!user) {
      setError('Sign in is required to upload images.');
      return;
    }

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Generate the object id before upload so the storage path is stable
    // even if the upload itself fails.
    const objectId = crypto.randomUUID();

    let uploaded;
    try {
      uploaded = await uploadMapImage(user.uid, objectId, file);
    } catch (err) {
      console.error('Image upload failed:', err);
      setError('Could not upload image.');
      return;
    }

    const map = mapRef.current;
    if (!map) {
      // The map has not rendered yet: the uploaded file would be orphaned,
      // so remove it before surfacing the error.
      try {
        await deleteMapImage(uploaded.storagePath);
      } catch (cleanupErr) {
        console.error('Failed to clean up uploaded image:', cleanupErr);
      }
      setError('Map is still loading.');
      return;
    }

    const { width, height } = await getImageDimensions(file);
    const bounds = createImageBounds(map, width / height);
    const imageObject: MapImage = {
      id: objectId,
      layerId: workspace.activeLayerId,
      type: 'image',
      title: file.name.replace(/\.[^.]+$/, ''),
      description: '',
      imageUrl: uploaded.imageUrl,
      storagePath: uploaded.storagePath,
      storageOwnerId: user.uid,
      fileName: file.name,
      contentType: file.type,
      bounds,
    };

    // Persist before touching local state: if the save fails the uploaded
    // file is removed and the user's map is left unchanged.
    try {
      await saveObject(user.uid, imageObject);
    } catch (err) {
      console.error('Failed to save image overlay:', err);
      try {
        await deleteMapImage(uploaded.storagePath);
      } catch (cleanupErr) {
        console.error('Failed to clean up uploaded image:', cleanupErr);
      }
      setError('Could not save image overlay.');
      return;
    }

    workspace.setObjects((prev) => [...prev, imageObject]);
  };

  return (
    <SidebarProvider className="relative h-screen overflow-hidden bg-background">

      {/* Mobile-only trigger: on desktop the footer/rail handles collapse.
          Sits right of the Leaflet zoom control, which index.css nudges to
          left: 24px to clear the sidebar rail. */}
      <div className="absolute top-4 left-16 z-[1100] md:hidden">
        <SidebarTrigger />
      </div>

      <Toolbar
        activeMode={session.drawingMode}
        setMode={session.setMode}
        canDraw={canDraw}
        onImageFileSelected={handleImageFileSelected}
      />

      {imageError && (
        <div
          role="alert"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1200] bg-destructive/90 text-destructive-foreground text-sm px-4 py-2 rounded-md shadow-lg"
        >
          {imageError}
        </div>
      )}

      {/* Left panel: shadcn sidebar (layers + selected object details) */}
      <LayerSidebar
        layers={workspace.layers}
        activeLayerId={workspace.activeLayerId}
        setActiveLayerId={workspace.setActiveLayerId}
        toggleLayerVisibility={workspace.toggleLayerVisibility}
        addLayer={workspace.addLayer}
        deleteLayer={workspace.deleteLayer}
        updateLayer={workspace.updateLayer}
        reorderLayer={workspace.reorderLayer}
        onObjectLayerChange={workspace.moveObjectToLayerAt}
        onObjectSort={workspace.reorderObjectInLayerAt}
        objects={workspace.objects}
        selectedObjectId={session.selectedObjectId}
        onObjectClick={session.selectObject}
        onObjectDeselect={() => session.setSelectedObjectId(null)}
        onObjectUpdate={workspace.patchObject}
        onObjectDelete={handleObjectDelete}
        onImportData={workspace.importData}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end gap-2 pointer-events-none">
        {/* Logo/Title */}
        <div className="bg-background/90 backdrop-blur px-4 py-2 rounded-lg shadow-sm border border-border pointer-events-auto">
          <h1 className="font-bold text-foreground">GeoLayer Mapper</h1>
        </div>

        {/* Auth Widget */}
        <div className="pointer-events-auto">
          <AuthWidget user={user} />
        </div>

        {!user && (
          <div className="bg-yellow-50 text-yellow-800 text-xs px-3 py-1.5 rounded-md border border-yellow-200 shadow-sm max-w-[200px] pointer-events-auto">
            Sign in to sync your map across devices.
          </div>
        )}
      </div>

      {session.drawingMode === 'ruler' && session.rulerPoints.length > 0 && (
        <MapHintBanner variant="dark">
          Click to measure, Double Click to finish
        </MapHintBanner>
      )}

      {canDraw && session.drawingMode !== 'none' && session.drawingMode !== 'ruler' && (
        <MapHintBanner variant="accent">
          Drawing Mode: {capitalize(session.drawingMode)} (Double click to finish shape)
        </MapHintBanner>
      )}

      {!canDraw && (
        <MapHintBanner>
          Add a layer from the sidebar to start drawing.
        </MapHintBanner>
      )}

      <SidebarInset>
        <MapBoard
          layers={workspace.layers}
          activeLayerId={workspace.activeLayerId}
          drawingMode={session.drawingMode}
          setDrawingMode={session.setMode}
          objects={workspace.objects}
          setObjects={workspace.setObjects}
          selectedObjectId={session.selectedObjectId}
          setSelectedObjectId={session.setSelectedObjectId}
          rulerPoints={session.rulerPoints}
          setRulerPoints={session.setRulerPoints}
          flyToTarget={session.flyToTarget}
          onObjectUpdate={workspace.persistObject}
          onNewObject={workspace.persistObject}
          onMapReady={handleMapReady}
        />
      </SidebarInset>
    </SidebarProvider>
  );
};

export default App;
