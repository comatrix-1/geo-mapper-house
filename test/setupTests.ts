import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Leaflet because JSDOM doesn't support Canvas/Rendering contexts well
vi.mock('leaflet', async () => {
  return {
    default: {
      ...await vi.importActual('leaflet'),
      divIcon: vi.fn(),
      map: vi.fn(),
    },
  };
});

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Polyfill matchMedia — Base UI (Tooltip/Dialog) and the shadcn useIsMobile
// hook require it, and JSDOM does not implement it.
if (!window.matchMedia) {
  window.matchMedia = ((query: string): MediaQueryList => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const mql = {
      matches: false,
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
      addListener: (cb: (e: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      },
      removeListener: (cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
      dispatchEvent: () => false,
    } as MediaQueryList;
    return mql;
  }) as typeof window.matchMedia;
}
