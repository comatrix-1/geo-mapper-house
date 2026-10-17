import { useState } from 'react';
import type { DrawingMode } from '../types';
import type { LatLngLiteral } from 'leaflet';

export interface FlyToTarget {
  id: string;
  time: number;
}

/**
 * UI-session state for the map: drawing mode, ruler trace, selection and the
 * fly-to request derived from it. Owns the interaction rules so App does not
 * duplicate them:
 * - shape tools are gated off while no layer exists to receive objects
 * - (re)entering the ruler starts a fresh trace
 * - entering any tool clears the selection
 */
export function useMapSession(canDraw: boolean) {
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('none');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);
  const [rulerPoints, setRulerPoints] = useState<LatLngLiteral[]>([]);

  const setMode = (mode: DrawingMode) => {
    if (!canDraw && mode !== 'none' && mode !== 'ruler') return;

    setDrawingMode(mode);
    // Fresh start whenever the ruler tool is (re)entered; a finished trace
    // stays on the map until the user picks the ruler again.
    if (mode === 'ruler') {
      setRulerPoints([]);
    }
    if (mode !== 'none') {
      setSelectedObjectId(null);
    }
  };

  const selectObject = (id: string) => {
    setSelectedObjectId(id);
    setFlyToTarget({ id, time: Date.now() });
  };

  return {
    drawingMode,
    setMode,
    selectedObjectId,
    setSelectedObjectId,
    selectObject,
    flyToTarget,
    rulerPoints,
    setRulerPoints
  };
}
