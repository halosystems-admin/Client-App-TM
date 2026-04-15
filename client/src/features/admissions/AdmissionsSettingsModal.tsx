import React, { useState } from 'react';
import { X, Settings } from 'lucide-react';
import type { AdmissionsViewMode } from '../../../../shared/types';

const VIEW_CONFIGS: Record<AdmissionsViewMode, { emoji: string; label: string; color: string; bgColor: string }> = {
  board: { emoji: '📋', label: 'Board View', color: 'text-cyan-600', bgColor: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100' },
  today: { emoji: '📅', label: 'Today View', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200 hover:bg-blue-100' },
  critical: { emoji: '🔴', label: 'Critical View', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200 hover:bg-red-100' },
  discharge: { emoji: '👋', label: 'Discharge View', color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200 hover:bg-amber-100' },
};

interface AdmissionsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultView: AdmissionsViewMode;
  onDefaultViewChange: (view: AdmissionsViewMode) => void;
}

export default function AdmissionsSettingsModal({
  isOpen,
  onClose,
  defaultView,
  onDefaultViewChange,
}: AdmissionsSettingsModalProps) {
  const [tempView, setTempView] = useState<AdmissionsViewMode>(defaultView);

  const handleSave = () => {
    onDefaultViewChange(tempView);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <Settings className="w-5 h-5 text-cyan-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Admissions settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <label className="block text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3 flex items-center gap-2">
            <span className="text-cyan-600">⚙️</span>
            Default view
          </label>
          {(['board', 'today', 'critical', 'discharge'] as AdmissionsViewMode[]).map((view) => {
            const config = VIEW_CONFIGS[view];
            return (
              <label
                key={view}
                className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  tempView === view
                    ? `${config.bgColor} border-current`
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="defaultView"
                  value={view}
                  checked={tempView === view}
                  onChange={() => setTempView(view)}
                  className="w-4 h-4"
                />
                <span className="text-lg">{config.emoji}</span>
                <span className={`text-sm font-semibold capitalize ${tempView === view ? config.color : 'text-slate-900'}`}>
                  {config.label}
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 text-slate-900 font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
