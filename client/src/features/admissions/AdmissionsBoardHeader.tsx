import React from 'react';
import { ArrowLeft, LayoutPanelTop, Plus, Search, Settings } from 'lucide-react';
import type { AdmissionsViewMode } from '../../../../shared/types';

const VIEW_OPTIONS: {
  id: AdmissionsViewMode;
  label: string;
  emoji: string;
}[] = [
  { id: 'board', label: 'Board', emoji: '📋' },
  { id: 'today', label: 'My tasks', emoji: '📅' },
  { id: 'critical', label: 'Critical', emoji: '🔴' },
  { id: 'discharge', label: 'Discharge', emoji: '👋' },
];

interface Props {
  onBack: () => void;
  boardSearch: string;
  onBoardSearchChange: (value: string) => void;
  saving: boolean;
  updatedAt: string;
  onAddPatient: () => void;
  currentView?: AdmissionsViewMode;
  onViewChange?: (view: AdmissionsViewMode) => void;
  onSettingsClick?: () => void;
}

export const AdmissionsBoardHeader: React.FC<Props> = ({
  onBack,
  boardSearch,
  onBoardSearchChange,
  saving,
  updatedAt,
  onAddPatient,
  currentView = 'board',
  onViewChange,
  onSettingsClick,
}) => {
  const formatDateFull = (dateString: string): string => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  return (
    <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 py-3 backdrop-blur-sm md:px-8 md:py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"
            aria-label="Back to workspace"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
            <LayoutPanelTop className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px]">Admissions</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Prioritize urgency, active tasks, and discharge readiness at a glance.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center lg:w-auto">
          <label className="relative block min-w-0 lg:min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input
              value={boardSearch}
              onChange={(event) => onBoardSearchChange(event.target.value)}
              placeholder="Search patients, tags, doctors..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-white"
            />
          </label>
          <button
            type="button"
            onClick={onAddPatient}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-600"
          >
            <Plus className="h-4 w-4" />
            Add patient
          </button>
        </div>
      </div>

      <div className="mt-3.5 overflow-x-auto -mx-4 px-4 md:-mx-8 md:px-8">
        <div className="inline-flex gap-1.5 pb-1">
          {VIEW_OPTIONS.map(({ id, label, emoji }) => {
            const isCurrentOption = id === currentView;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onViewChange?.(id)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                  isCurrentOption
                    ? 'bg-cyan-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{emoji}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          {saving ? 'Saving…' : `Updated ${formatDateFull(updatedAt)}`}
        </p>
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="inline-flex items-center justify-center h-8 px-3 rounded-full text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition gap-1.5"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
          </button>
        )}
      </div>
    </div>
  );
};
