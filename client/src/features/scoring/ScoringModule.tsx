import React, { useState } from 'react';
import { scoringConfig } from './scoringConfig';
import type { ScoringSystem } from './scoringTypes';
import { ScoringDashboard } from './ScoringDashboard';
import { CalculatorView } from './CalculatorView';
import { ChevronLeft } from 'lucide-react';
import { AppStatus } from '../../../shared/types';

interface ScoringModuleProps {
  onToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const ScoringModule: React.FC<ScoringModuleProps> = ({ onToast }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const systems = scoringConfig.systems;

  const activeSystem: ScoringSystem | undefined = systems.find((s) => s.id === activeId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {activeSystem && (
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-slate-500 hover:text-teal-700 hover:border-teal-200 hover:bg-teal-50 transition-all active:scale-[0.97]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Clinical tools
            </p>
            <h1 className="text-base font-bold text-slate-900">
              Clinical Scoring Systems
            </h1>
          </div>
        </div>
      </div>

      {!activeSystem ? (
        <ScoringDashboard systems={systems} onSelectSystem={setActiveId} showBmiInline />
      ) : (
        <CalculatorView
          system={activeSystem}
          onCopied={(msg) => onToast?.(msg, 'success')}
        />
      )}
    </div>
  );
};

