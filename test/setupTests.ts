import '@testing-library/jest-dom';
import { vi } from 'vitest';

// src/utils/supabase.ts throws at import time without these, but no test
// talks to the real project (the Supabase client is mocked per-suite), so
// placeholder values are only needed to let the module load. Existing .env
// values, when present, win.
import.meta.env.VITE_SUPABASE_URL ??= 'https://stub.supabase.co';
import.meta.env.VITE_SUPABASE_KEY ??= 'stub-anon-key';

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
