import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ObjectDetailsPanel from '../../src/components/ObjectDetailsPanel';
import type {
  GeometryEditMode,
  MapCircle,
  MapImage,
  MapObject,
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
  opacity: 0.6,
};

const legacyImage: MapImage = {
  ...base,
  id: 'img-legacy',
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
  positions: [
    { lat: 1, lng: 1 },
    { lat: 2, lng: 2 },
  ],
};

const polygon: MapPolygon = {
  ...base,
  id: 'pg-1',
  type: 'polygon',
  positions: [
    { lat: 0, lng: 0 },
    { lat: 1, lng: 0 },
    { lat: 1, lng: 1 },
  ],
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
  obj: MapObject,
  mode: GeometryEditMode = 'resize',
  onUpdate = vi.fn(),
) => {
  render(
    <ObjectDetailsPanel
      obj={obj}
      geometryEditMode={mode}
      onGeometryEditModeChange={vi.fn()}
      onUpdate={onUpdate}
      onDelete={vi.fn()}
    />,
  );
  return onUpdate;
};

const opacitySlider = () =>
  screen.getByLabelText('Opacity') as HTMLInputElement;

describe('ObjectDetailsPanel image opacity control', () => {
  it('shows a labeled 0–100% range control for a selected image', () => {
    renderPanel(image);

    const slider = opacitySlider();
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('100');
    expect(slider.value).toBe('60');
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('shows 100% for a legacy image saved without an opacity value', () => {
    expect(legacyImage).not.toHaveProperty('opacity');
    renderPanel(legacyImage);

    const slider = opacitySlider();
    expect(slider.value).toBe('100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it.each([
    ['0%', 0, 0],
    ['100%', 1, 100],
  ])('reports %s when the stored opacity is %s', (_label, stored, percent) => {
    renderPanel({ ...image, opacity: stored });

    const slider = opacitySlider();
    expect(slider.value).toBe(String(percent));
    expect(screen.getByText(`${percent}%`)).toBeInTheDocument();
  });

  it('sends a normalized opacity update for the selected image only', () => {
    const onUpdate = renderPanel(image);

    fireEvent.change(opacitySlider(), { target: { value: '25' } });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('img-1', { opacity: 0.25 });
    // No other object is ever named in the patch.
    const ids = onUpdate.mock.calls.map(([id]) => id);
    expect(ids).toEqual(['img-1']);
  });

  it.each([
    ['img-zero', 1, '0', 0],
    ['img-full', 0, '100', 1],
  ] as const)(
    'can set %s from the control to normalized opacity %s',
    (id, stored, target, normalized) => {
      const onUpdate = renderPanel({ ...image, id, opacity: stored });

      fireEvent.change(opacitySlider(), { target: { value: target } });

      expect(onUpdate).toHaveBeenCalledWith(id, { opacity: normalized });
    },
  );

  it.each([
    ['point', point],
    ['circle', circle],
    ['polyline', polyline],
    ['polygon', polygon],
  ])('omits the opacity control for a selected %s', (_label, obj) => {
    renderPanel(obj);

    expect(screen.queryByLabelText('Opacity')).not.toBeInTheDocument();
  });
});
