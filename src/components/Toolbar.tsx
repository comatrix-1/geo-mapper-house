import React from 'react';
import { MousePointer2, MapPin, Circle, PenTool, Hexagon, Ruler } from 'lucide-react';
import type { DrawingMode } from '../types';

interface ToolbarProps {
  activeMode: DrawingMode;
  setMode: (mode: DrawingMode) => void;
  /** False while no layer exists to receive drawn objects. */
  canDraw?: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({ activeMode, setMode, canDraw = true }) => {
  const tools: { mode: DrawingMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'none', icon: <MousePointer2 size={20} />, label: 'Select' },
    { mode: 'point', icon: <MapPin size={20} />, label: 'Point' },
    { mode: 'circle', icon: <Circle size={20} />, label: 'Circle' },
    { mode: 'polyline', icon: <PenTool size={20} />, label: 'Line' },
    { mode: 'polygon', icon: <Hexagon size={20} />, label: 'Polygon' },
    { mode: 'ruler', icon: <Ruler size={20} />, label: 'Measure' },
  ];

  // Select and the ruler create nothing, so they stay usable on an empty map.
  const isDisabled = (mode: DrawingMode) => !canDraw && mode !== 'none' && mode !== 'ruler';

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-md shadow-lg rounded-full px-4 py-2 flex items-center space-x-2 z-[1000] border border-gray-200">
      {tools.map((tool) => {
        const disabled = isDisabled(tool.mode);

        return (
        <button
          key={tool.mode}
          onClick={() => setMode(tool.mode)}
          disabled={disabled}
          className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center tooltip-trigger group relative ${
            activeMode === tool.mode
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
          } ${disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent' : ''}`}
          aria-label={tool.label}
          title={disabled ? 'Add a layer first' : undefined}
        >
          {tool.icon}
          {/* Tooltip */}
          <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {disabled ? `${tool.label} - add a layer first` : tool.label}
          </span>
        </button>
        );
      })}
    </div>
  );
};

export default Toolbar;