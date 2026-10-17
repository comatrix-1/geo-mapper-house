import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LayerSidebar from '../../src/components/LayerSidebar';
import { SidebarProvider } from '../../src/components/ui/sidebar';
import LayerRow from '../../src/components/LayerRow';
import type { Layer } from '../../src/types';

const makeLayer = (id: string, name = id): Layer => ({
  id,
  name,
  visible: true,
  style: { borderColor: '#000', borderWidth: 2, fillColor: '#000', fillOpacity: 0.2 },
});

const pointObj: MapObject = {
  id: 'p1',
  layerId: 'l1',
  type: 'point',
  title: 'My Point',
  description: '',
  position: { lat: 1, lng: 2 },
} as MapPoint;

const layerA = makeLayer('l1', 'Points of Interest');
const layerB = makeLayer('l2', 'Boundaries');

const baseProps = {
  layers: [layerA, layerB],
  activeLayerId: 'l1',
  setActiveLayerId: vi.fn(),
  toggleLayerVisibility: vi.fn(),
  addLayer: vi.fn(),
  deleteLayer: vi.fn(),
  updateLayer: vi.fn(),
  objects: [pointObj],
  selectedObjectId: null as string | null,
  onObjectClick: vi.fn(),
  onObjectDeselect: vi.fn(),
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

describe('LayerSidebar drag handle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a drag handle with an accessible role per layer', () => {
    renderSidebar(baseProps);
    expect(screen.getAllByRole('button', { name: /drag to reorder/i })).toHaveLength(2);
  });
});

describe('LayerRow drag handle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sortable grip handle and no drop-line indicators anywhere', () => {
    render(
      <SidebarProvider>
        <LayerRow
          layer={layerA}
          objects={[pointObj]}
          isActive={false}
          open={false}
          onOpenChange={vi.fn()}
          onActivate={vi.fn()}
          canDelete
          selectedObjectId={null}
          onObjectClick={vi.fn()}
          onObjectDeselect={vi.fn()}
          onEdit={vi.fn()}
          onToggleVisibility={vi.fn()}
          onDelete={vi.fn()}
        />
      </SidebarProvider>
    );
    expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
    // Drop-line logic was removed entirely; nothing renders such a marker.
    expect(screen.queryByTestId('drop-line')).not.toBeInTheDocument();
  });
});
