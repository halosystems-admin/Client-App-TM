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
    <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/80 backdrop-blur-sm">
      <div
        className={`mx-3 my-3 rounded-2xl border px-4 py-3 shadow-sm ${colors.bg} ${colors.border}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center rounded-xl bg-white/70 px-3 py-2 border border-white/70 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Score
              </span>
              <span className="text-xl font-bold text-slate-900 tabular-nums">
                {Number.isNaN(totalScore) ? '–' : totalScore.toFixed(1).replace(/\.0$/, '')}
              </span>
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${colors.text}`}>
                {activeBand ? `${activeBand.riskLevel} risk`.toUpperCase() : 'Incomplete'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {activeBand
                  ? activeBand.clinicalRecommendation
                  : 'Select criteria above to see risk and guidance.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

