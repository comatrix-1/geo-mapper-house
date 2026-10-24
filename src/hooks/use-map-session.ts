import { useRef, useState } from 'react';
import type { DrawingMode, GeometryEditMode } from '../types';
import type { LatLngLiteral } from 'leaflet';

export interface FocusTarget {
  id: string;
  /** Strictly increasing request token. Each focus request gets a fresh one
   * so re-focusing the same object still moves the map. */
  token: number;
}

/** A geometry editing mode together with the selection it was chosen for. */
interface EditChoice {
  /** Drawing tool and selected object the mode belongs to. */
  owner: string;
  mode: GeometryEditMode;
}

/** No choice made yet: matches no selection, so the default mode reads back. */
const NO_CHOICE: EditChoice = { owner: '', mode: 'resize' };

/**
 * UI-session state for the map: drawing mode, ruler trace, selection and the
 * focus request derived from it. Owns the interaction rules so App does not
 * duplicate them:
 * - shape tools are gated off while no layer exists to receive objects
 * - (re)entering the ruler starts a fresh trace
 * - entering any tool clears the selection
 * - the geometry editing mode belongs to one selection instance only: a new
 *   selection (even of the same object after a deselection) starts in
 *   four-handle resize, while re-selecting the current selection keeps its mode
 * - selecting an object from the sidebar also focuses it on the map
 */
export function useMapSession(canDraw: boolean) {
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('none');
  const [selectedObjectId, setSelectedObjectIdState] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [rulerPoints, setRulerPoints] = useState<LatLngLiteral[]>([]);
  // Transient, selection-scoped geometry editing mode, stored together with the
  // selection instance it was chosen for. The choice is only read back while
  // that very selection instance and tool are still active, so a new
  // selection, clearing the selection or picking another tool falls back to
  // the four-handle resize default without a second render pass. It is never
  // persisted with the object.
  const [editChoice, setEditChoice] = useState<EditChoice>(NO_CHOICE);
  // Monotonic counter for focus requests. A timestamp would be swallowed
  // when two clicks land in the same millisecond, so the same object could
  // fail to re-focus.
  const focusTokenRef = useRef(0);
  // Identifies the current selection instance. Bumped whenever an incoming
  // selection differs from the current one, so A -> null -> A and A -> B -> A
  // each produce a fresh owner while re-selecting the already-selected object
  // keeps it. Only the wrapped setter below touches it, always from an event
  // handler — never during render.
  const [selectionSeq, setSelectionSeq] = useState(0);
  const lastSelectedIdRef = useRef<string | null>(null);

  const setSelectedObjectId = (id: string | null) => {
    if (lastSelectedIdRef.current !== id) {
      setSelectionSeq((seq) => seq + 1);
      lastSelectedIdRef.current = id;
    }
    setSelectedObjectIdState(id);
  };

  const selectionOwner = `${drawingMode}:${selectedObjectId ?? ''}:${selectionSeq}`;
  const geometryEditMode: GeometryEditMode =
    editChoice.owner === selectionOwner ? editChoice.mode : 'resize';
  const setGeometryEditMode = (mode: GeometryEditMode) =>
    setEditChoice({ owner: selectionOwner, mode });

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

  /**
   * Selects an object and asks the map to focus it. Focusing only re-centres
   * the viewport on the object; the zoom level is left untouched. This is the
   * sidebar path — clicking an object on the map selects it without moving
   * the viewport. Shares the wrapped setter so both entry points bump the
   * selection instance the same way.
   */
  const selectObject = (id: string) => {
    focusTokenRef.current += 1;
    setSelectedObjectId(id);
    setFocusTarget({ id, token: focusTokenRef.current });
  };

  return {
    drawingMode,
    setMode,
    selectedObjectId,
    setSelectedObjectId,
    selectObject,
    focusTarget,
    rulerPoints,
    setRulerPoints,
    geometryEditMode,
    setGeometryEditMode,
  };
}
