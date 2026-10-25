import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const importFileMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/fileImporter', () => ({
  importFile: importFileMock,
}));

import LayerSidebar from '../../src/components/LayerSidebar';
import { SidebarProvider } from '../../src/components/ui/sidebar';
import type { Layer, MapObject, MapPoint } from '../../src/types';

const layerA: Layer = {
  id: 'l1',
  name: 'Points of Interest',
  visible: true,
  style: { borderColor: '#ef4444', borderWidth: 2, fillColor: '#ef4444', fillOpacity: 0.2 },
};

const layerB: Layer = {
  id: 'l2',
  name: 'Boundaries',
  visible: false,
  style: { borderColor: '#3b82f6', borderWidth: 2, fillColor: '#3b82f6', fillOpacity: 0.2 },
};

const pointObj: MapPoint = {
  id: 'p1',
  layerId: 'l1',
  type: 'point',
  title: 'My Point',
  description: '',
  position: { lat: 1.3521, lng: 103.8198 },
};

const objects: MapObject[] = [pointObj];

const baseProps = {
  layers: [layerA, layerB],
  activeLayerId: 'l1',
  setActiveLayerId: vi.fn(),
  toggleLayerVisibility: vi.fn(),
  addLayer: vi.fn(),
  deleteLayer: vi.fn(),
  updateLayer: vi.fn(),
  objects,
  selectedObjectId: null as string | null,
  onObjectClick: vi.fn(),
  onObjectDeselect: vi.fn(),
  geometryEditMode: 'resize' as const,
  onGeometryEditModeChange: vi.fn(),
  onObjectUpdate: vi.fn(),
  onObjectDelete: vi.fn(),
  onImportData: vi.fn(),
  onSaveProject: vi.fn(),
  onLoadProject: vi.fn(),
};

function renderSidebar(props: React.ComponentProps<typeof LayerSidebar>) {
  return render(
    <SidebarProvider>
      <LayerSidebar {...props} />
    </SidebarProvider>
  );
}

describe('LayerSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders layer names and the Layers header', () => {
    renderSidebar(baseProps);

    expect(screen.getByText('Layers')).toBeInTheDocument();
    expect(screen.getByText('Points of Interest')).toBeInTheDocument();
    expect(screen.getByText('Boundaries')).toBeInTheDocument();
  });

  it('calls onObjectClick when an object item is clicked', () => {
    const onObjectClick = vi.fn();
    renderSidebar({ ...baseProps, onObjectClick, objects });

    fireEvent.click(screen.getByText('My Point'));
    expect(onObjectClick).toHaveBeenCalledWith('p1');
  });

  it('calls onObjectDeselect when the selected object is clicked again', () => {
    const onObjectDeselect = vi.fn();
    renderSidebar({ ...baseProps, selectedObjectId: 'p1', onObjectDeselect, objects });

    fireEvent.click(screen.getByRole('button', { name: 'My Point' }));
    expect(onObjectDeselect).toHaveBeenCalledTimes(1);
  });

  it('calls toggleLayerVisibility from the layer row eye button', () => {
    const toggleLayerVisibility = vi.fn();
    renderSidebar({ ...baseProps, toggleLayerVisibility });

    fireEvent.click(screen.getByTitle('Hide layer'));
    expect(toggleLayerVisibility).toHaveBeenCalledWith('l1');
  });

  it('calls addLayer from the Add Layer button', () => {
    const addLayer = vi.fn();
    renderSidebar({ ...baseProps, addLayer });

    fireEvent.click(screen.getByRole('button', { name: /Add Layer/ }));
    expect(addLayer).toHaveBeenCalledTimes(1);
  });

  it('shows the selected object details under a persistent Properties panel', () => {
    renderSidebar({ ...baseProps, selectedObjectId: 'p1', objects });

    expect(
      screen.getByRole('heading', { level: 2, name: 'My Point' })
    ).toBeInTheDocument();
    expect(screen.getByText('Properties')).toBeInTheDocument();
    // The panel is persistent, so there is no close control anymore.
    expect(
      screen.queryByRole('button', { name: 'Close details' })
    ).not.toBeInTheDocument();
  });

  it('shows an empty-state message in Properties when nothing is selected', () => {
    renderSidebar({ ...baseProps, selectedObjectId: null, objects });

    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(
      screen.getByText(/Select an object to view and edit its properties/)
    ).toBeInTheDocument();
  });

  it('activating a layer does not collapse it shut', () => {
    const setActiveLayerId = vi.fn();
    renderSidebar({ ...baseProps, activeLayerId: 'l1', objects, setActiveLayerId });

    // The active layer's object list starts open.
    expect(screen.getByText('My Point')).toBeInTheDocument();

    // Clicking another layer activates it without toggling the row shut.
    fireEvent.click(screen.getByText('Boundaries'));
    expect(setActiveLayerId).toHaveBeenCalledWith('l2');
    expect(screen.getByText('My Point')).toBeInTheDocument();
  });

  it('toggles a layer object list from the chevron alone', () => {
    renderSidebar({ ...baseProps, objects });

    const collapse = screen.getAllByRole('button', {
      name: 'Collapse layer objects',
    })[0];
    expect(collapse).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(collapse);
    expect(screen.queryByText('My Point')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Expand layer objects' })[0]
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps layer actions mounted in icon-collapsed mode', () => {
    renderSidebar({ ...baseProps, objects });

    // Actions stay in the DOM (revealed on hover/focus by CSS) so collapsed
    // mode can still manage layers. One per layer, two layers here.
    expect(screen.getAllByTitle('Layer settings')).toHaveLength(2);
    expect(screen.getAllByTitle('Hide layer')).toHaveLength(1);
    expect(screen.getAllByTitle('Delete layer')).toHaveLength(2);
  });

  it('rejects an import containing no layers', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    importFileMock.mockResolvedValue({ layers: [], objects: [] });

    renderSidebar(baseProps);

    const input = document.querySelector(
      'input[accept=".kml,.kmz,.json,.geojson"]'
    ) as HTMLInputElement;
    const file = new File(['{}'], 'empty.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('no layers')
      );
    });
    // The preview modal (which would dereference layers[0]) never opened.
    expect(screen.queryByText('Import Layer Preview')).not.toBeInTheDocument();
    expect(baseProps.onImportData).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
