import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Toolbar from '../../src/components/Toolbar';

const pngFile = new File(['x'], 'test.png', { type: 'image/png' });

describe('Toolbar Component', () => {
  it('renders all tools', () => {
    const setMode = vi.fn();
    render(<Toolbar activeMode="none" setMode={setMode} onImageFileSelected={vi.fn()} />);

    expect(screen.getByLabelText('Select')).toBeInTheDocument();
    expect(screen.getByLabelText('Point')).toBeInTheDocument();
    expect(screen.getByLabelText('Circle')).toBeInTheDocument();
    expect(screen.getByLabelText('Line')).toBeInTheDocument();
    expect(screen.getByLabelText('Polygon')).toBeInTheDocument();
    expect(screen.getByLabelText('Measure')).toBeInTheDocument();
    expect(screen.getByLabelText('Image')).toBeInTheDocument();
  });

  it('highlights the active tool', () => {
    const setMode = vi.fn();
    render(<Toolbar activeMode="circle" setMode={setMode} onImageFileSelected={vi.fn()} />);

    const circleBtn = screen.getByLabelText('Circle');
    // Check for the active class we use (bg-blue-600)
    expect(circleBtn).toHaveClass('bg-blue-600');

    const pointBtn = screen.getByLabelText('Point');
    expect(pointBtn).not.toHaveClass('bg-blue-600');
  });

  it('calls setMode when a tool is clicked', () => {
    const setMode = vi.fn();
    render(<Toolbar activeMode="none" setMode={setMode} onImageFileSelected={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Measure'));
    expect(setMode).toHaveBeenCalledWith('ruler');
  });

  it('forwards selected image file to onImageFileSelected', async () => {
    const setMode = vi.fn();
    const onImageFileSelected = vi.fn();
    const user = userEvent.setup();
    render(<Toolbar activeMode="none" setMode={setMode} onImageFileSelected={onImageFileSelected} />);

    await user.upload(screen.getByLabelText('Choose image file'), pngFile);
    expect(onImageFileSelected).toHaveBeenCalledWith(pngFile);
  });
});
