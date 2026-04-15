import React from 'react';
import type { TriageColor } from '../../../../shared/types';

interface TriageColorPickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentColor?: TriageColor;
  onColorSelect: (color: TriageColor) => void;
}

const TRIAGE_COLORS: { color: TriageColor; label: string; bgClass: string }[] = [
  { color: 'red', label: 'Critical', bgClass: 'bg-red-500' },
  { color: 'orange', label: 'High', bgClass: 'bg-orange-500' },
  { color: 'yellow', label: 'Medium', bgClass: 'bg-yellow-500' },
  { color: 'green', label: 'Stable', bgClass: 'bg-green-500' },
  { color: 'blue', label: 'Info', bgClass: 'bg-blue-500' },
  { color: 'gray', label: 'None', bgClass: 'bg-gray-400' },
];

export default function TriageColorPicker({
  isOpen,
  onClose,
  currentColor,
  onColorSelect,
}: TriageColorPickerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-sm rounded-2xl shadow-2xl p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Triage priority</h3>
        <div className="grid grid-cols-2 gap-2">
          {TRIAGE_COLORS.map(({ color, label, bgClass }) => (
            <button
              key={color}
              onClick={() => {
                onColorSelect(color);
                onClose();
              }}
              className={`p-3 rounded-lg border-2 transition-all ${
                currentColor === color
                  ? 'border-slate-900 ring-2 ring-slate-900/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className={`w-6 h-6 rounded-full mx-auto mb-1.5 ${bgClass}`} />
              <p className="text-xs font-medium text-slate-900">{label}</p>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
