import React, { useMemo, useRef, useState } from 'react';
import type { ScoringSystem } from './scoringTypes';

interface Props {
  systems: ScoringSystem[];
  onSelectSystem: (id: string) => void;
  /** When true, also shows BMI and search optimized for patient workspace. */
  showBmiInline?: boolean;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Cardiology: ' ❤️',
  Pulmonology: ' 🫁',
  'Critical Care': ' 🚨',
  Neurology: ' 🧠',
  Hepatology: ' 🧬',
  'Infectious Disease': ' 🦠',
  Psychiatry: ' 🧠',
  'General Surgery': ' 🔪',
};

export const ScoringDashboard: React.FC<Props> = ({
  systems,
  onSelectSystem,
  showBmiInline = false,
}) => {
  const [query, setQuery] = useState('');
  const [bmiWeight, setBmiWeight] = useState('');
  const [bmiHeight, setBmiHeight] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const systemsByCategory = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const byCategory: Record<string, ScoringSystem[]> = {};
    systems.forEach((system) => {
      const haystack = `${system.title} ${system.category} ${system.description}`.toLowerCase();
      if (lowered && !haystack.includes(lowered)) return;
      if (!byCategory[system.category]) byCategory[system.category] = [];
      byCategory[system.category].push(system);
    });
    return byCategory;
  }, [systems, query]);

  const sortedCategories = Object.keys(systemsByCategory).sort();

  const categoryIds = useMemo(
    () =>
      sortedCategories.reduce<Record<string, string>>((map, cat) => {
        map[cat] = `category-${cat.toLowerCase().replace(/\s+/g, '-')}`;
        return map;
      }, {}),
    [sortedCategories],
  );

  const scrollToCategory = (category: string) => {
    const id = categoryIds[category];
    if (!id) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`#${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={containerRef} className="space-y-6 relative">
      {/* Sticky search + category index */}
      <div className="sticky top-0 z-10 pb-2 bg-slate-50/80 backdrop-blur-sm">
        <div className="flex flex-col gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scoring tools (e.g. PE, chest pain, stroke)…"
            className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
          {sortedCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 custom-scrollbar">
              {sortedCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => scrollToCategory(category)}
                  className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-800 hover:bg-teal-50 transition-all"
                >
                  {category}
                  {CATEGORY_EMOJIS[category] ?? ''}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Optional inline BMI card */}
      {showBmiInline && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-slate-800">
                Body Mass Index (BMI)
              </p>
              <p className="text-[11px] text-slate-500">
                One-handed bedside mini-calculator for quick BMI checks.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Weight (kg)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={bmiWeight}
                  onChange={(e) =>
                    setBmiWeight(e.target.value.replace(/[^0-9.]/g, ''))
                  }
                  placeholder="70"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Height (cm)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={bmiHeight}
                  onChange={(e) =>
                    setBmiHeight(e.target.value.replace(/[^0-9.]/g, ''))
                  }
                  placeholder="175"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
            </div>
            <div className="w-full sm:w-32 flex items-center justify-center">
              {(() => {
                const w = parseFloat(bmiWeight);
                const hMeters = parseFloat(bmiHeight) / 100;
                const bmi =
                  w > 0 && hMeters > 0 ? w / (hMeters * hMeters) : NaN;
                if (!Number.isFinite(bmi)) {
                  return (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 py-2 w-full">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        BMI
                      </span>
                      <span className="text-sm text-slate-400 mt-1">
                        —
                      </span>
                    </div>
                  );
                }
                const value = bmi.toFixed(1);
                let label = 'Healthy';
                let badgeClass =
                  'bg-teal-50 text-teal-700 border-teal-100';
                if (bmi < 18.5) {
                  label = 'Underweight';
                  badgeClass = 'bg-blue-50 text-blue-700 border-blue-100';
                } else if (bmi >= 25 && bmi < 30) {
                  label = 'Overweight';
                  badgeClass =
                    'bg-orange-50 text-orange-700 border-orange-100';
                } else if (bmi >= 30) {
                  label = 'Obese';
                  badgeClass = 'bg-rose-50 text-rose-700 border-rose-100';
                }
                return (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 w-full">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      BMI
                    </span>
                    <span className="text-xl font-bold text-slate-900 leading-tight tabular-nums mt-1">
                      {value}
                    </span>
                    <span
                      className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {sortedCategories.map((category) => (
        <section
          key={category}
          id={categoryIds[category]}
          className="space-y-3 scroll-mt-20"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              {category}
              {CATEGORY_EMOJIS[category] ?? ''}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {systemsByCategory[category]
              .slice()
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((system) => (
                <button
                  key={system.id}
                  type="button"
                  onClick={() => onSelectSystem(system.id)}
                  className="flex flex-col items-start justify-between rounded-2xl border border-slate-100 bg-white px-4 py-4 text-left shadow-sm hover:shadow-md hover:border-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 transition-all active:scale-[0.99]"
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800 mb-1">
                      {system.title}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-3">
                      {system.description}
                    </p>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500" />
                    Clinical score
                  </div>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
};


