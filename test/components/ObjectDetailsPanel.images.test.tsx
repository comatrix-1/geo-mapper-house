import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ObjectDetailsPanel from '../../src/components/ObjectDetailsPanel';
import type { MapPoint } from '../../src/types';

const pointWithImages: MapPoint = {
  id: 'p1',
  layerId: 'l1',
  type: 'point',
  title: 'My Point',
  description: '',
  position: { lat: 1.3521, lng: 103.8198 },
  images: [
    {
      id: 'img-1',
      imageUrl: 'https://download.example/first.png',
      fileName: 'first.png',
      storagePath: 'users/u1/objectImages/p1/img-1/first.png',
      storageOwnerId: 'u1',
    },
    {
      id: 'img-2',
      imageUrl: 'https://download.example/second.png',
      fileName: 'second.png',
      storagePath: 'users/u1/objectImages/p1/img-2/second.png',
      storageOwnerId: 'u1',
    },
  ],
};

const pointWithoutImages: MapPoint = { ...pointWithImages, images: undefined };

const renderPanel = (
  obj: MapPoint,
  overrides: Partial<React.ComponentProps<typeof ObjectDetailsPanel>> = {},
) => {
  const props: React.ComponentProps<typeof ObjectDetailsPanel> = {
    obj,
    geometryEditMode: 'resize',
    onGeometryEditModeChange: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    canAddImages: true,
    onAddImage: vi.fn(),
    onRemoveImage: vi.fn(),
    ...overrides,
  };
  render(<ObjectDetailsPanel {...props} />);
  return props;
};

describe('ObjectDetailsPanel images section', () => {
  it('renders a thumbnail per attached image, linking to the full image', () => {
    renderPanel(pointWithImages);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://download.example/first.png');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(screen.getByAltText('first.png')).toBeInTheDocument();
    expect(screen.getByAltText('second.png')).toBeInTheDocument();
  });

  it('shows an empty Images section for an object without attachments', () => {
    renderPanel(pointWithoutImages);

    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('calls onRemoveImage with the object id and image id from a remove control', () => {
    const onRemoveImage = vi.fn();
    renderPanel(pointWithImages, { onRemoveImage });

    fireEvent.click(screen.getByRole('button', { name: 'Remove image first.png' }));

    expect(onRemoveImage).toHaveBeenCalledWith('p1', 'img-1');
  });

  it('calls onAddImage with the object id and picked files', () => {
    const onAddImage = vi.fn();
    renderPanel(pointWithImages, { onAddImage });

    const input = document.querySelector(
      'input[type="file"][accept="image/*"]'
    ) as HTMLInputElement;
    const a = new File(['a'], 'a.png', { type: 'image/png' });
    const b = new File(['b'], 'b.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [a, b] });
    fireEvent.change(input);

    expect(onAddImage).toHaveBeenCalledWith('p1', [a, b]);
  });

  it('disables Add, hides remove controls and shows the sign-in hint when canAddImages is false, while thumbnails still render', () => {
    const onRemoveImage = vi.fn();
    renderPanel(pointWithImages, { canAddImages: false, onRemoveImage });

    expect(screen.getByAltText('first.png')).toBeInTheDocument();
    expect(screen.getByAltText('second.png')).toBeInTheDocument();

    const add = screen.getByRole('button', { name: 'Add images' });
    expect(add).toBeDisabled();
    expect(screen.getByText('Sign in to add images.')).toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: 'Remove image first.png' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove image second.png' })
    ).not.toBeInTheDocument();

    // The remove callback stays untouched even if the hidden control fired.
    fireEvent.click(screen.getByRole('button', { name: 'Add images' }));
    expect(onRemoveImage).not.toHaveBeenCalled();
  });
});
