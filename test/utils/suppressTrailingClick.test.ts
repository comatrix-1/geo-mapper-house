import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { suppressTrailingClick } from '../../src/utils/suppressTrailingClick';

/**
 * Mirrors the real gesture geometry: the trailing `click` lands on the map
 * container's descendant (or the container itself), and Leaflet's map handler
 * is a bubble-phase listener on the container.
 */
const buildMapContainer = () => {
  const container = document.createElement('div');
  const handle = document.createElement('div');
  container.appendChild(handle);
  document.body.appendChild(container);
  return { container, handle };
};

/** Registers a bubble-phase click listener like Leaflet's map handler. */
const listenOnContainer = (container: HTMLElement) => {
  const mapClick = vi.fn();
  container.addEventListener('click', mapClick);
  return mapClick;
};

describe('suppressTrailingClick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('stops a click dispatched after arming from reaching a container listener', () => {
    const { container, handle } = buildMapContainer();
    const mapClick = listenOnContainer(container);

    suppressTrailingClick();
    handle.click();

    expect(mapClick).not.toHaveBeenCalled();
  });

  it('stops the click even when it targets the container itself', () => {
    // The real bug case: mousedown on the handle, mouseup elsewhere — the
    // browser dispatches the click on the nearest common ancestor.
    const { container } = buildMapContainer();
    const mapClick = listenOnContainer(container);

    suppressTrailingClick();
    container.click();

    expect(mapClick).not.toHaveBeenCalled();
  });

  it('removes the listener after it fires, so the next click gets through', () => {
    const { container, handle } = buildMapContainer();
    const mapClick = listenOnContainer(container);
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    suppressTrailingClick();
    handle.click();
    expect(mapClick).not.toHaveBeenCalled();

    // A later, genuine deselect click must reach the map handler.
    handle.click();
    expect(mapClick).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
      true,
    );

    removeSpy.mockRestore();
  });

  it('disarms on a 0 ms timer when no click follows the gesture', () => {
    const { container, handle } = buildMapContainer();
    const mapClick = listenOnContainer(container);
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    suppressTrailingClick();
    vi.advanceTimersByTime(0);

    expect(removeSpy).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
      true,
    );

    // Nothing stays armed: a click after the disarm is a real click.
    handle.click();
    expect(mapClick).toHaveBeenCalledTimes(1);

    removeSpy.mockRestore();
  });
});
