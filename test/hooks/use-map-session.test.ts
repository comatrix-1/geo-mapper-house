import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMapSession } from '../../src/hooks/use-map-session';

describe('useMapSession geometry edit mode', () => {
  it('defaults to four-handle resize', () => {
    const { result } = renderHook(() => useMapSession(true));
    expect(result.current.geometryEditMode).toBe('resize');
  });

  it('resets to resize when a different object is selected', () => {
    const { result } = renderHook(() => useMapSession(true));

    act(() => result.current.setSelectedObjectId('a'));
    act(() => result.current.setGeometryEditMode('vertices'));
    expect(result.current.geometryEditMode).toBe('vertices');

    act(() => result.current.selectObject('b'));
    expect(result.current.geometryEditMode).toBe('resize');
  });

  it('resets to resize on deselection', () => {
    const { result } = renderHook(() => useMapSession(true));

    act(() => result.current.setSelectedObjectId('a'));
    act(() => result.current.setGeometryEditMode('vertices'));
    expect(result.current.geometryEditMode).toBe('vertices');

    act(() => result.current.setSelectedObjectId(null));
    expect(result.current.geometryEditMode).toBe('resize');
  });

  it('resets to resize when the drawing tool changes', () => {
    const { result } = renderHook(() => useMapSession(true));

    act(() => result.current.setSelectedObjectId('a'));
    act(() => result.current.setGeometryEditMode('vertices'));
    expect(result.current.geometryEditMode).toBe('vertices');

    act(() => result.current.setMode('polygon'));
    expect(result.current.geometryEditMode).toBe('resize');
  });

  it('resets to resize when the same object is re-selected after a deselection', () => {
    const { result } = renderHook(() => useMapSession(true));

    act(() => result.current.setSelectedObjectId('a'));
    act(() => result.current.setGeometryEditMode('vertices'));
    expect(result.current.geometryEditMode).toBe('vertices');

    act(() => result.current.setSelectedObjectId(null));
    act(() => result.current.setSelectedObjectId('a'));
    expect(result.current.geometryEditMode).toBe('resize');
  });

  it('resets to resize when selection moves A -> B -> A', () => {
    const { result } = renderHook(() => useMapSession(true));

    act(() => result.current.setSelectedObjectId('a'));
    act(() => result.current.setGeometryEditMode('vertices'));
    expect(result.current.geometryEditMode).toBe('vertices');

    act(() => result.current.selectObject('b'));
    act(() => result.current.selectObject('a'));
    expect(result.current.geometryEditMode).toBe('resize');
  });

  it('keeps the chosen mode when the already-selected object is re-selected', () => {
    const { result } = renderHook(() => useMapSession(true));

    act(() => result.current.setSelectedObjectId('a'));
    act(() => result.current.setGeometryEditMode('vertices'));

    // Re-focusing the object that is already selected is not a new
    // selection, so the mode the user picked survives.
    act(() => result.current.selectObject('a'));
    expect(result.current.geometryEditMode).toBe('vertices');
  });
});
