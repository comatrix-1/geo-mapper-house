import React from 'react';
import MapBoard from './components/MapBoard';
import LayerSidebar from './components/LayerSidebar';
import Toolbar from './components/Toolbar';
import AuthWidget from './components/AuthWidget';
import MapHintBanner from './components/MapHintBanner';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { saveProjectToFile, loadProjectFromFile } from './utils/fileImporter';
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
      />

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
        />
      </SidebarInset>
    </SidebarProvider>
  );
};

export default App;
