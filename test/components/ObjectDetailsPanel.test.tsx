import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ObjectDetailsPanel from '../../src/components/ObjectDetailsPanel';
import { getEditHint, VERTEX_LIMIT } from '../../src/utils/editHints';
import type { MapCircle, MapPoint, MapPolygon, MapPolyline } from '../../src/types';

const point: MapPoint = {
  id: 'p1',
  layerId: 'l1',
  type: 'point',
  title: 'My Point',
  description: 'Has a https://example.com link',
  position: { lat: 1.3521, lng: 103.8198 },
};

const circle: MapCircle = {
  id: 'c1',
  layerId: 'l1',
  type: 'circle',
  title: 'My Circle',
  description: '',
  center: { lat: 1.35, lng: 103.82 },
  radius: 500,
};

const polyline: MapPolyline = {
  id: 'pl1',
  layerId: 'l1',
  type: 'polyline',
  title: 'My Line',
  description: '',
  positions: [
    { lat: 1.0, lng: 1.0 },
    { lat: 2.0, lng: 2.0 },
  ],
};

const polygon: MapPolygon = {
  id: 'pg1',
  layerId: 'l1',
  type: 'polygon',
  title: 'My Polygon',
  description: '',
  positions: [
    { lat: 0, lng: 0 },
    { lat: 1, lng: 0 },
    { lat: 1, lng: 1 },
  ],
};

describe('ObjectDetailsPanel', () => {
  it('renders the object title and an editable description field', () => {
    render(
      <ObjectDetailsPanel
        obj={point}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'My Point' })).toBeInTheDocument();
    // Fields are editable by default: description is a textarea, not read-only text.
    const description = screen.getByLabelText('Description') as HTMLTextAreaElement;
    expect(description.tagName).toBe('TEXTAREA');
    expect(description.value).toBe('Has a https://example.com link');
  });

  it('shows point coordinates in view mode', () => {
    render(
      <ObjectDetailsPanel
        obj={point}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(/Lat: 1\.352100/)).toBeInTheDocument();
    expect(screen.getByText(/Lng: 103\.819800/)).toBeInTheDocument();
  });

  it('shows circle area and radius', () => {
    render(
      <ObjectDetailsPanel
        obj={circle}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // 500 m radius -> ~785398 m2
    expect(screen.getByText('785398.2 m²')).toBeInTheDocument();
    expect(screen.getByText('500.0 m')).toBeInTheDocument();
  });

  it('shows polyline distance', () => {
    render(
      <ObjectDetailsPanel
        obj={polyline}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('157.23 km')).toBeInTheDocument();
  });

  it('shows polygon area', () => {
    render(
      <ObjectDetailsPanel
        obj={polygon}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // ~111 km² for a 1x1 degree polygon near the equator
    expect(screen.getByText(/km²/)).toBeInTheDocument();
  });

  it('calls onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <ObjectDetailsPanel
        obj={circle}
        onUpdate={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Object' }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });

  it('patches title via onUpdate with fields editable by default', () => {
    const onUpdate = vi.fn();
    render(
      <ObjectDetailsPanel
        obj={circle}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );

    const titleInput = screen.getByLabelText('Title');
    fireEvent.change(titleInput, { target: { value: 'Renamed' } });

    expect(onUpdate).toHaveBeenCalledWith('c1', { title: 'Renamed' });
  });

  it('patches circle radius', () => {
    const onUpdate = vi.fn();
    render(
      <ObjectDetailsPanel
        obj={circle}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );

    const radiusInput = screen.getByLabelText('Radius (m)');
    fireEvent.change(radiusInput, { target: { value: '750' } });

    expect(onUpdate).toHaveBeenCalledWith('c1', { radius: 750 });
  });

  it('keeps fractional and cleared radius text in the field', () => {
    const onUpdate = vi.fn();
    render(
      <ObjectDetailsPanel
        obj={circle}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );

    const radiusInput = screen.getByLabelText('Radius (m)') as HTMLInputElement;

    // A decimal survives keystrokes instead of being re-rounded mid-edit
    // (the old Math.round(value) turned "100.5" into "1005").
    fireEvent.change(radiusInput, { target: { value: '100.5' } });
    expect(radiusInput.value).toBe('100.5');
    expect(onUpdate).toHaveBeenCalledWith('c1', { radius: 100.5 });

    // Clearing the field is allowed: no patch, but the input stays empty.
    fireEvent.change(radiusInput, { target: { value: '' } });
    expect(radiusInput.value).toBe('');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not patch invalid or non-positive radius values', () => {
    const onUpdate = vi.fn();
    render(
      <ObjectDetailsPanel
        obj={circle}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />
    );

    const radiusInput = screen.getByLabelText('Radius (m)');

    fireEvent.change(radiusInput, { target: { value: 'abc' } });
    fireEvent.change(radiusInput, { target: { value: '-5' } });
    fireEvent.change(radiusInput, { target: { value: '0' } });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows a Save button that confirms with Saved feedback', () => {
    render(
      <ObjectDetailsPanel
        obj={circle}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const saveButton = screen.getByRole('button', { name: /Save/ });
    fireEvent.click(saveButton);

    expect(screen.getByRole('button', { name: /Saved/ })).toBeInTheDocument();
  });
});

describe('getEditHint', () => {
  it('provides a hint for every object type', () => {
    const hints = [point, circle, polyline, polygon].map(getEditHint);
    for (const hint of hints) {
      expect(hint).toBeTruthy();
    }
  });

  it('warns about complex shapes beyond the vertex limit', () => {
    const complex: MapPolyline = {
      ...polyline,
      positions: Array.from({ length: VERTEX_LIMIT + 1 }, (_, i) => ({
        lat: i * 0.001,
        lng: i * 0.001,
      })),
    };
    expect(getEditHint(complex)).toMatch(/too complex/i);
    expect(getEditHint(polyline)).not.toMatch(/too complex/i);
  });

  it('renders the hint inside the panel in view mode', () => {
    render(
      <ObjectDetailsPanel
        obj={circle}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(getEditHint(circle))).toBeInTheDocument();
  });
});
