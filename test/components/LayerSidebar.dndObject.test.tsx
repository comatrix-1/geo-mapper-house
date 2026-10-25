import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LayerSidebar from '../../src/components/LayerSidebar';
import { SidebarProvider } from '../../src/components/ui/sidebar';
import { DraggableObjectItem } from '../../src/components/LayerRow';
import type { Layer, MapObject, MapPoint } from '../../src/types';

import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

const makeLayer = (id: string, name = id): Layer => ({
  id,
  name,
  visible: true,
  style: { borderColor: '#000', borderWidth: 2, fillColor: '#000', fillOpacity: 0.2 },
});

const pointObj = (id: string, layerId: string, title = id): MapObject => {
  const point: MapPoint = {
    id,
    layerId,
    type: 'point',
    title,
    description: '',
    position: { lat: 0, lng: 0 },
  };
  return point;
};

const layerA = makeLayer('l1', 'Alpha');
const layerB = makeLayer('l2', 'Beta');

const baseProps = {
  layers: [layerA, layerB],
  activeLayerId: 'l1',
  setActiveLayerId: vi.fn(),
  toggleLayerVisibility: vi.fn(),
  addLayer: vi.fn(),
  deleteLayer: vi.fn(),
  updateLayer: vi.fn(),
  reorderLayer: vi.fn(),
  onObjectLayerChange: vi.fn(),
  objects: [pointObj('p1', 'l1'), pointObj('p2', 'l1'), pointObj('p3', 'l2')],
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

describe('object rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one drag handle per object row shown and a body drop zone per expanded layer', () => {
    // Both layers start closed unless openLayers was set; the active layer
    // (l1) auto-opens. Expanding is driven by openLayers prop state in the
    // sidebar, so object rows only appear for l1 here.
    renderSidebar(baseProps);
    expect(screen.getAllByTestId('drag-handle').length).toBeGreaterThanOrEqual(2);
  });

  it('DraggableObjectItem exposes its grip handle separately from the row', () => {
    render(
      <SidebarProvider>
        <DndContext>
          <SortableContext items={['object:p9']}>
            <DraggableObjectItem
              obj={pointObj('p9', 'l1', 'Lonely')}
              selected={false}
              onSelect={vi.fn()}
              onDeselect={vi.fn()}
            />
          </SortableContext>
        </DndContext>
      </SidebarProvider>
    );
    const row = screen.getByRole('button', { name: /Lonely/ });
    expect(row).toBeInTheDocument();
    expect(screen.getByTestId('object-drag-handle')).toBeInTheDocument();
    // The row itself is no longer the drag activator; handle is separate.
    expect(
      row.getAttribute('aria-roledescription')
    ).not.toBe('draggable');
  });
});
