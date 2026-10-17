import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  /** Neutral hint matching the app chrome (empty-map state). */
  subtle: 'bg-background/90 backdrop-blur text-foreground border border-border shadow-sm',
  /** Primary action highlight (active drawing mode). */
  accent: 'bg-blue-600 text-white shadow-lg',
  /** Low-emphasis dark hint (ruler measurement). */
  dark: 'bg-black/80 text-white'
} as const;

export type BannerVariant = keyof typeof VARIANTS;

interface MapHintBannerProps {
  variant?: BannerVariant;
  children: ReactNode;
}

/** Bottom-center overlay hint shown for ruler/drawing/empty-map states. */
const MapHintBanner = ({ variant = 'subtle', children }: MapHintBannerProps) => (
  <div
    className={cn(
      'absolute bottom-8 left-1/2 transform -translate-x-1/2 z-[1000] px-4 py-2 rounded-full text-sm animate-fade-in-up',
      VARIANTS[variant]
    )}
  >
    {children}
  </div>
);

export default MapHintBanner;
