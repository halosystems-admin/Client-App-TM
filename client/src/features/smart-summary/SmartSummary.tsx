import React, { useState } from 'react';
import { Sparkles, Loader2, ChevronRight } from 'lucide-react';

interface Props {
  summary: string[];
  loading: boolean;
}

export const SmartSummary: React.FC<Props> = ({ summary, loading }) => {
  /** Collapsed by default; bullets only after user opens. */
  const [expanded, setExpanded] = useState(false);
  const hasBullets = summary.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-teal-100/80 bg-gradient-to-b from-teal-50/90 to-white/80 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm">
      <div className="sticky top-0 z-10 border-b border-teal-100/50 bg-teal-50/90 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            if (loading) return;
            if (hasBullets) setExpanded((e) => !e);
          }}
          disabled={loading}
          aria-expanded={hasBullets ? expanded : undefined}
          className="flex w-full max-w-xl items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-teal-100/40 disabled:cursor-wait disabled:opacity-90 sm:px-3 sm:py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-teal-100/80">
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin text-teal-600" aria-hidden />
              ) : (
                <Sparkles className="h-3 w-3 text-teal-600" aria-hidden />
              )}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-teal-600/90 sm:text-[10px]">
                Smart summary
              </p>
              <p className="truncate text-xs font-medium text-slate-800">
                {loading
                  ? 'Generating…'
                  : hasBullets
                    ? expanded
                      ? 'Hide highlights'
                      : `${summary.length} highlight${summary.length === 1 ? '' : 's'} · Show`
                    : 'No summary yet'}
              </p>
            </div>
          </div>
          {!loading && hasBullets && (
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-teal-600 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              aria-hidden
            />
          )}
        </button>
      </div>

      {expanded && !loading && (
        <div className="max-h-[min(22rem,55vh)] overflow-y-auto px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
          {hasBullets ? (
            <ul className="space-y-2.5">
              {summary.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 rounded-xl bg-white/70 px-3 py-2 text-sm leading-snug text-slate-700 ring-1 ring-slate-100"
                >
                  <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 py-2 text-sm italic text-slate-500">No summary available.</p>
          )}
        </div>
      )}
    </div>
  );
};
