import React, { useState, useRef } from 'react';
import type { Layer, MapObject, LayerStyle } from '../types';
import { 
    Eye, 
    EyeOff, 
    Layers, 
    Trash2, 
    Plus, 
    ChevronDown, 
    ChevronRight,
    MapPin,
    Circle,
    PenTool,
    Hexagon,
    Upload,
    Settings,
    X,
    Palette,
    FolderOpen,
    Save,
    AlertTriangle,
    FileJson
} from 'lucide-react';
import { importFile } from '../utils/fileImporter';

interface LayerSidebarProps {
  layers: Layer[];
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  updateLayer: (layer: Layer) => void;
  objects: MapObject[];
  selectedObjectId: string | null;
  onObjectClick: (id: string) => void;
  onImportData: (layers: Layer[], objects: MapObject[]) => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
}

// Sub-component for editing style
const LayerStyleEditor = ({ 
    style, 
    onChange 
}: { 
    style: LayerStyle, 
    onChange: (s: LayerStyle) => void 
}) => {
    return (
        <div className="space-y-3 p-1">
             <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500 uppercase">Border Color</label>
                <div className="flex items-center gap-2">
                    <input 
                        type="color" 
                        value={style.borderColor}
                        onChange={(e) => onChange({ ...style, borderColor: e.target.value })}
                        className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                    />
                    <span className="text-xs font-mono text-gray-600">{style.borderColor}</span>
                </div>
             </div>

             <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500 uppercase">Fill Color</label>
                <div className="flex items-center gap-2">
                    <input 
                        type="color" 
                        value={style.fillColor}
                        onChange={(e) => onChange({ ...style, fillColor: e.target.value })}
                        className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                    />
                     <span className="text-xs font-mono text-gray-600">{style.fillColor}</span>
                </div>
             </div>

             <div>
                 <div className="flex justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Fill Opacity</label>
                    <span className="text-xs text-gray-600">{(style.fillOpacity * 100).toFixed(0)}%</span>
                 </div>
                 <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    value={style.fillOpacity}
                    onChange={(e) => onChange({ ...style, fillOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                 />
             </div>

             <div>
                 <div className="flex justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Border Width</label>
                    <span className="text-xs text-gray-600">{style.borderWidth}px</span>
                 </div>
                 <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    step="1"
                    value={style.borderWidth}
                    onChange={(e) => onChange({ ...style, borderWidth: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                 />
             </div>
        </div>
    );
};

// Modal for editing layer settings (Single Layer)
const LayerSettingsModal = ({ 
    layer, 
    onSave, 
    onCancel, 
    title = "Layer Settings",
    extraInfo
}: { 
    layer: Layer, 
    onSave: (l: Layer) => void, 
    onCancel: () => void,
    title?: string,
    extraInfo?: React.ReactNode
}) => {
    const [editedLayer, setEditedLayer] = useState<Layer>(layer);

    return (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Settings size={18} />
                        {title}
                    </h3>
                    <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-4 space-y-4">
                    {extraInfo}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Layer Name</label>
                        <input 
                            type="text" 
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={editedLayer.name}
                            onChange={(e) => setEditedLayer({...editedLayer, name: e.target.value})}
                        />
                    </div>
                    
                    <div className="border-t border-gray-100 pt-3">
                         <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                             <Palette size={14} /> Style
                         </h4>
                         <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <LayerStyleEditor 
                                style={editedLayer.style}
                                onChange={(newStyle) => setEditedLayer({...editedLayer, style: newStyle})}
                            />
                         </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                    <button 
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => onSave(editedLayer)}
                        className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

const LayerSidebar: React.FC<LayerSidebarProps> = ({
  layers,
  activeLayerId,
  setActiveLayerId,
  toggleLayerVisibility,
  addLayer,
  deleteLayer,
  updateLayer,
  objects,
  selectedObjectId,
  onObjectClick,
  onImportData,
  onSaveProject,
  onLoadProject
}) => {
  const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(new Set([activeLayerId]));
  const [editingLayer, setEditingLayer] = useState<Layer | null>(null);
  const [importPreview, setImportPreview] = useState<{ layers: Layer[], objects: MapObject[] } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const toggleAccordion = (layerId: string) => {
    const newSet = new Set(expandedLayerIds);
    if (newSet.has(layerId)) {
        newSet.delete(layerId);
    } else {
        newSet.add(layerId);
    }
    setExpandedLayerIds(newSet);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const result = await importFile(file);
          setImportPreview(result);
      } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          alert('Failed to import file:\n' + message);
          console.error(err);
      } finally {
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const handleProjectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          onLoadProject(file);
      }
      if (projectInputRef.current) projectInputRef.current.value = '';
  };

  const getObjectIcon = (type: MapObject['type']) => {
      switch (type) {
          case 'point': return <MapPin size={14} />;
          case 'circle': return <Circle size={14} />;
          case 'polyline': return <PenTool size={14} />;
          case 'polygon': return <Hexagon size={14} />;
      }
  };

  return (
    <>
        <div className="absolute top-4 left-4 w-72 bg-white/95 backdrop-blur-sm shadow-xl rounded-xl z-[1000] flex flex-col max-h-[calc(100vh-32px)] overflow-hidden border border-gray-200 font-sans">
        <div className="p-3 border-b border-gray-100 bg-gray-50/80">
            <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <Layers size={18} className="text-blue-600" />
                    Layers
                </h2>
                
                {/* Project Controls */}
                <div className="flex gap-1">
                    <input 
                        type="file" 
                        ref={projectInputRef} 
                        className="hidden" 
                        accept=".json" 
                        onChange={handleProjectFileChange}
                    />
                    <button
                        onClick={onSaveProject}
                        className="p-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-md transition-colors shadow-sm"
                        title="Save Project (Export JSON)"
                    >
                        <Save size={14} />
                    </button>
                    <button
                        onClick={() => projectInputRef.current?.click()}
                        className="p-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-md transition-colors shadow-sm"
                        title="Open Project (Import JSON - Replaces All)"
                    >
                        <FolderOpen size={14} />
                    </button>
                </div>
            </div>

            {/* Layer Controls */}
            <div className="flex gap-2">
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".kml,.kmz,.json,.geojson" 
                    onChange={handleImportFileChange}
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-1.5 px-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                    <Upload size={12} />
                    Import
                </button>
                <button
                    onClick={addLayer}
                    className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                    <Plus size={12} />
                    Add Layer
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {layers.map((layer) => {
                const layerObjects = objects.filter(o => o.layerId === layer.id);
                const isActive = activeLayerId === layer.id;
                const isExpanded = expandedLayerIds.has(layer.id);

                return (
                    <div
                    key={layer.id}
                    className={`rounded-lg border transition-all overflow-hidden ${
                        isActive
                        ? 'border-blue-400 bg-blue-50/30'
                        : 'border-transparent hover:bg-gray-50'
                    }`}
                    >
                        {/* Layer Header */}
                        <div className="flex items-center justify-between p-3">
                            <div 
                                className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                                onClick={() => toggleAccordion(layer.id)}
                            >
                                <button 
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAccordion(layer.id);
                                    }}
                                >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                                
                                <div 
                                    className="w-3 h-3 rounded-full shadow-sm flex-shrink-0 border border-gray-200" 
                                    style={{ 
                                        backgroundColor: layer.style.fillColor,
                                        borderColor: layer.style.borderColor 
                                    }} 
                                />
                                
                                <span 
                                    className={`text-sm font-medium truncate ${isActive ? 'text-blue-900' : 'text-gray-700'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveLayerId(layer.id);
                                    }}
                                >
                                    {layer.name}
                                </span>
                            </div>
                            
                            <div className="flex items-center gap-0.5 pl-1">
                                <button
                                    onClick={() => setEditingLayer(layer)}
                                    className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                                    title="Layer settings"
                                >
                                    <Settings size={14} />
                                </button>
                                <button
                                    onClick={() => toggleLayerVisibility(layer.id)}
                                    className={`p-1.5 rounded hover:bg-gray-200 ${layer.visible ? 'text-gray-600' : 'text-gray-400'}`}
                                    title={layer.visible ? "Hide layer" : "Show layer"}
                                >
                                    {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                </button>
                                {layers.length > 1 && (
                                    <button
                                    onClick={() => deleteLayer(layer.id)}
                                    className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                                    title="Delete layer"
                                    >
                                    <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    
                        {/* Object List (Accordion Body) */}
                        {isExpanded && (
                            <div className="bg-white/50 border-t border-gray-100/50">
                                {layerObjects.length === 0 ? (
                                    <div className="p-3 text-xs text-gray-400 italic pl-10">
                                        No objects in this layer
                                    </div>
                                ) : (
                                    <ul className="py-1">
                                        {layerObjects.map(obj => (
                                            <li 
                                                key={obj.id}
                                                onClick={() => onObjectClick(obj.id)}
                                                className={`
                                                    flex items-center gap-3 px-3 py-2 pl-10 cursor-pointer text-sm
                                                    hover:bg-blue-50 transition-colors
                                                    ${selectedObjectId === obj.id ? 'bg-blue-100 text-blue-800' : 'text-gray-600'}
                                                `}
                                            >
                                                <span className="opacity-70">
                                                    {getObjectIcon(obj.type)}
                                                </span>
                                                <span className="truncate">{obj.title || "Untitled Object"}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        <div className="p-3 bg-gray-50 text-xs text-center text-gray-400 border-t border-gray-100">
            GeoLayer Mapper v1.5.0
        </div>
        </div>

        {/* Edit Layer Modal */}
        {editingLayer && (
            <LayerSettingsModal 
                layer={editingLayer}
                onSave={(updatedLayer) => {
                    updateLayer(updatedLayer);
                    setEditingLayer(null);
                }}
                onCancel={() => setEditingLayer(null)}
            />
        )}

        {/* Import Preview Modal Logic */}
        {importPreview && (
            importPreview.layers.length > 1 ? (
                // Multi-Layer Import Confirmation Modal
                <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                             <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <FileJson size={18} />
                                Multi-Layer Import
                            </h3>
                            <button onClick={() => setImportPreview(null)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="bg-blue-50 text-blue-800 p-3 rounded-lg border border-blue-100 text-sm">
                                <p className="font-semibold mb-1">Project File Detected</p>
                                <p>This file contains multiple layers.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 p-3 rounded border border-gray-200 text-center">
                                     <div className="text-xl font-bold text-gray-800">{importPreview.layers.length}</div>
                                     <div className="text-xs text-gray-500 uppercase font-semibold">Layers</div>
                                </div>
                                <div className="bg-gray-50 p-3 rounded border border-gray-200 text-center">
                                     <div className="text-xl font-bold text-gray-800">{importPreview.objects.length}</div>
                                     <div className="text-xs text-gray-500 uppercase font-semibold">Objects</div>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                Importing will add these layers to your current map. Existing layers will be kept.
                            </p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button 
                                onClick={() => setImportPreview(null)}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    onImportData(importPreview.layers, importPreview.objects);
                                    setImportPreview(null);
                                    // Expand newly imported layers
                                    setExpandedLayerIds(prev => {
                                        const next = new Set(prev);
                                        importPreview.layers.forEach(l => next.add(l.id));
                                        return next;
                                    });
                                }}
                                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors"
                            >
                                Import Layers
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                // Single Layer Import (Original Behavior)
                <LayerSettingsModal 
                    layer={importPreview.layers[0]}
                    title="Import Layer Preview"
                    extraInfo={
                        <div className={`text-sm p-3 rounded-md flex items-center gap-2 mb-2 ${importPreview.objects.length > 0 ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
                             {importPreview.objects.length > 0 ? (
                                 <>
                                    <Layers size={16} />
                                    <span>Found <strong>{importPreview.objects.length}</strong> objects.</span>
                                 </>
                             ) : (
                                 <>
                                    <AlertTriangle size={16} />
                                    <span>No objects found in file! The layer will be empty.</span>
                                 </>
                             )}
                        </div>
                    }
                    onSave={(finalLayer) => {
                        // Pass as single-item array
                        onImportData([finalLayer], importPreview.objects);
                        setImportPreview(null);
                        setExpandedLayerIds(prev => new Set(prev).add(finalLayer.id));
                    }}
                    onCancel={() => setImportPreview(null)}
                />
            )
        )}
    </>
  );
};

export default LayerSidebar;