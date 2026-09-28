import React, { useState } from "react";
import { Popup } from "react-leaflet";
import type {
  MapObject,
} from "../types";
import { Pencil, Trash2, Check } from "lucide-react";

interface ObjectPopupProps {
  obj: MapObject;
  updateObjectMeta: (id: string, title: string, desc: string) => void;
  onDelete: (id: string) => void;
  renderExtraView: () => React.ReactNode;
  renderExtraEdit?: () => React.ReactNode;
}

export const ObjectPopup = ({
  obj,
  updateObjectMeta,
  onDelete,
  renderExtraView,
  renderExtraEdit,
}: ObjectPopupProps) => {
  const [isEditing, setIsEditing] = useState(false);

  // Helper to render description with clickable links
  const renderDescription = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) =>
      urlRegex.test(part) ? (
        <a
          key={`${i}-${part}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-800 break-all"
        >
          {part}
        </a>
      ) : (
        part
      )
    );
  };

  return (
    <Popup minWidth={260} maxWidth={300}>
      <div className="flex flex-col gap-3 w-full font-sans">
        {isEditing ? (
          // Edit Mode
          <div className="flex flex-col gap-2">
            <div>
              <label
                htmlFor="object-title-input"
                className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
              >
                Title
              </label>
              <input
                id="object-title-input"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                value={obj.title}
                onChange={(e) =>
                  updateObjectMeta(obj.id, e.target.value, obj.description)
                }
                placeholder="Title"
              />
            </div>
            <div>
              <label
                htmlFor="object-description-input"
                className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
              >
                Description
              </label>
              <textarea
                id="object-description-input"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none transition-all"
                rows={3}
                value={obj.description}
                onChange={(e) =>
                  updateObjectMeta(obj.id, obj.title, e.target.value)
                }
                placeholder="Description"
              />
            </div>

            {renderExtraEdit && renderExtraEdit()}

            <div className="flex justify-end pt-2 mt-1 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Check size={14} />
                <span>Done</span>
              </button>
            </div>
          </div>
        ) : (
          // View Mode
          <div className="flex flex-col gap-1">
            <div className="flex flex-col">
              <h3 className="font-bold text-lg text-gray-900 leading-tight">
                {obj.title || "Untitled"}
              </h3>
              {obj.description && (
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">
                  {renderDescription(obj.description)}
                </p>
              )}
            </div>

            <div className="mt-2 pt-2 border-t border-gray-100">
              {renderExtraView()}
            </div>

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200/60">
              <button
                type="button"
                onClick={() => onDelete(obj.id)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                title="Delete Object"
                aria-label="Delete Object"
              >
                <Trash2 size={16} />
              </button>

              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-all text-sm font-medium"
              >
                <Pencil size={14} />
                <span>Edit</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Popup>
  );
};

interface RadiusInputProps {
  value: number;
  onChange: (val: number) => void;
}

export const RadiusInput = ({ value, onChange }: RadiusInputProps) => {
  // Render-phase sync pattern (recommended by React docs): if the external
  // value diverges from what the user is typing, we reset the local string by
  // re-rendering with a new key/state derived from the external value instead
  // of calling setState inside an effect.
  const [prevValue, setPrevValue] = useState(value);
  const [localValue, setLocalValue] = useState(value.toString());

  if (!Object.is(prevValue, value)) {
    setPrevValue(value);
    if (Math.abs(Number.parseFloat(localValue || "0") - value) > 1) {
      setLocalValue(Math.round(value).toString());
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    const val = Number.parseFloat(newVal);
    if (!Number.isNaN(val) && val > 0) {
      onChange(val);
    }
  };

  return (
    <div className="mt-1">
      <label
        htmlFor="circle-radius-input"
        className="text-xs font-semibold text-gray-500 uppercase tracking-wider"
      >
        Radius (m)
      </label>
      <input
        id="circle-radius-input"
        type="number"
        min="1"
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-1 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        value={localValue}
        onChange={handleChange}
      />
    </div>
  );
};
