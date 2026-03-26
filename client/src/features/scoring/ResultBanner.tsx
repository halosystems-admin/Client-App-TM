import React from 'react';
import type { ScoringResultBand } from './scoringTypes';

interface Props {
  totalScore: number;
  activeBand: ScoringResultBand | null;
}

const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
  emerald: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
  },
  rose: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-800',
  },
};

export const ResultBanner: React.FC<Props> = ({ totalScore, activeBand }) => {
  const colorKey = activeBand?.colorCode || 'emerald';
  const colors = colorClasses[colorKey] || colorClasses.emerald;

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur-sm pb-[env(safe-area-inset-bottom,0px)]">
      <div
        className={`mx-2 my-2 rounded-2xl border px-3 py-3 shadow-sm sm:mx-3 sm:px-4 ${colors.bg} ${colors.border}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex shrink-0 flex-row items-center gap-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2 shadow-sm sm:flex-col sm:items-center sm:px-4 sm:py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Score
            </span>
            <span className="text-xl font-bold tabular-nums text-slate-900">
              {Number.isNaN(totalScore) ? '–' : totalScore.toFixed(1).replace(/\.0$/, '')}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${colors.text}`}>
              {activeBand ? `${activeBand.riskLevel} risk`.toUpperCase() : 'Incomplete'}
            </p>
            <p className="mt-1 break-words text-xs leading-relaxed text-slate-600">
              {activeBand
                ? activeBand.clinicalRecommendation
                : 'Select criteria above to see risk and guidance.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

