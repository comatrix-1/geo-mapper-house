import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ObjectDetailsPanel from '../../src/components/ObjectDetailsPanel';
import type {
  GeometryEditMode,
  MapCircle,
  MapImage,
  MapPoint,
  MapPolygon,
  MapPolyline,
} from '../../src/types';

const base = {
  layerId: 'l1',
  title: 'Object',
  description: '',
};

const image: MapImage = {
  ...base,
  id: 'img-1',
  type: 'image',
  imageUrl: 'https://example.com/p.png',
  fileName: 'p.png',
  contentType: 'image/png',
  bounds: { southWest: { lat: 1, lng: 1 }, northEast: { lat: 5, lng: 5 } },
};

const polyline: MapPolyline = {
  ...base,
  id: 'pl-1',
  type: 'polyline',
  positions: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }],
};

const polygon: MapPolygon = {
  ...base,
  id: 'pg-1',
  type: 'polygon',
  positions: [{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }, { lat: 1, lng: 1 }],
};

const circle: MapCircle = {
  ...base,
  id: 'c-1',
  type: 'circle',
  center: { lat: 1, lng: 2 },
  radius: 100,
};

const point: MapPoint = {
  ...base,
  id: 'p-1',
  type: 'point',
  position: { lat: 1, lng: 2 },
};

const renderPanel = (
  obj: MapImage | MapPolyline | MapPolygon | MapCircle | MapPoint,
  mode: GeometryEditMode = 'resize',
  onChange = vi.fn(),
) => {
  render(
    <ObjectDetailsPanel
      obj={obj}
      geometryEditMode={mode}
      onGeometryEditModeChange={onChange}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  return onChange;
};

describe('ObjectDetailsPanel geometry mode choice', () => {
  it.each([
    ['image', image],
    ['polyline', polyline],
    ['polygon', polygon],
  ])('shows the mode choice for a selected %s', (_label, obj) => {
    renderPanel(obj);
    expect(screen.getByRole('radiogroup', { name: /geometry editing/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Resize' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Edit vertices' })).toBeInTheDocument();
  });

  it.each([
    ['circle', circle],
    ['point', point],
  ])('omits the mode choice for a selected %s', (_label, obj) => {
    renderPanel(obj);
    expect(screen.queryByRole('radio', { name: 'Resize' })).not.toBeInTheDocument();
  });

  it('defaults the choice to four-handle resize', () => {
    renderPanel(image, 'resize');
    expect(screen.getByRole('radio', { name: 'Resize' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Edit vertices' })).not.toBeChecked();
  });

  it('reflects the vertex mode when selected', () => {
    renderPanel(image, 'vertices');
    expect(screen.getByRole('radio', { name: 'Resize' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Edit vertices' })).toBeChecked();
  });

  it('reports the change when a mode is chosen via keyboard', () => {
    const onChange = renderPanel(image, 'resize');
    const vertices = screen.getByRole('radio', { name: 'Edit vertices' });
    vertices.focus();
    fireEvent.click(vertices);
    expect(onChange).toHaveBeenCalledWith('vertices');
  });
});
