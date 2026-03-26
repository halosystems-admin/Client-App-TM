import React, { useMemo, useState } from 'react';
import type {
  ScoringSystem,
  ScoringCriterion,
  BinaryCriterion,
  MultiCriterion,
  NumericCriterion,
  ScoringResultBand,
} from './scoringTypes';
import { ResultBanner } from './ResultBanner';

type CriterionState = Record<string, unknown>;

interface Props {
  system: ScoringSystem;
}

const isBinary = (c: ScoringCriterion): c is BinaryCriterion => c.type === 'binary';
const isMulti = (c: ScoringCriterion): c is MultiCriterion => c.type === 'multi';
const isNumeric = (c: ScoringCriterion): c is NumericCriterion => c.type === 'numeric';

export const CalculatorView: React.FC<Props> = ({ system }) => {
  const [values, setValues] = useState<CriterionState>({});

  const handleToggleBinary = (criterionId: string) => {
    setValues((prev) => ({
      ...prev,
      [criterionId]: !(prev[criterionId] as boolean),
    }));
  };

  const handleSelectOption = (criterionId: string, optionId: string) => {
    setValues((prev) => ({
      ...prev,
      [criterionId]: optionId,
    }));
  };

  const handleNumericChange = (criterionId: string, raw: string) => {
    const num = raw === '' ? '' : Number(raw);
    if (raw !== '' && Number.isNaN(num)) return;
    setValues((prev) => ({
      ...prev,
      [criterionId]: num,
    }));
  };

  const { totalScore, activeBand } = useMemo(() => {
    let score = 0;

    for (const criterion of system.criteria) {
      const rawValue = values[criterion.id];

      if (isBinary(criterion)) {
        if (rawValue) score += criterion.points;
        continue;
      }

      if (isMulti(criterion)) {
        const optionId = rawValue as string | undefined;
        if (!optionId) continue;
        const option = criterion.options.find((o) => o.id === optionId);
        if (option) score += option.points;
        continue;
      }

      if (isNumeric(criterion)) {
        const num = typeof rawValue === 'number' ? rawValue : undefined;
        if (num == null) continue;
        const band = criterion.ranges.find((r) => {
          const min = r.minValue ?? Number.NEGATIVE_INFINITY;
          const max = r.maxValue ?? Number.POSITIVE_INFINITY;
          return num >= min && num <= max;
        });
        if (band) score += band.points;
      }
    }

    const band: ScoringResultBand | null =
      system.results.find((r) => score >= r.minScore && score <= r.maxScore) ?? null;

    return { totalScore: score, activeBand: band };
  }, [system, values]);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold text-slate-900">{system.title}</h1>
        <p className="text-xs text-slate-500 leading-relaxed">{system.description}</p>
      </div>

      <div className="space-y-4">
        {system.criteria.map((criterion) => {
          const rawValue = values[criterion.id];

          if (isBinary(criterion)) {
            const active = !!rawValue;
            return (
              <div
                key={criterion.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{criterion.label}</p>
                  {criterion.helperText && (
                    <p className="mt-1 text-xs text-slate-500">{criterion.helperText}</p>
                  )}
                  <p className="mt-1 text-[11px] font-semibold text-slate-400">
                    +{criterion.points} point{criterion.points !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleBinary(criterion.id)}
                  className={`relative inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-full px-4 text-xs font-bold uppercase tracking-wide transition-all sm:h-11 sm:w-auto sm:min-w-[5.5rem] ${
                    active
                      ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {active ? 'Present' : 'Absent'}
                </button>
              </div>
            );
          }

          if (isMulti(criterion)) {
            const selectedId = rawValue as string | undefined;
            return (
              <div
                key={criterion.id}
                className="rounded-2xl bg-white border border-slate-100 px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{criterion.label}</p>
                    {criterion.helperText && (
                      <p className="mt-1 text-xs text-slate-500">{criterion.helperText}</p>
                    )}
                  </div>
                </div>
                <div className="-mx-1 flex max-w-full flex-nowrap gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 pb-1 [-webkit-overflow-scrolling:touch] custom-scrollbar-x sm:flex-wrap sm:overflow-visible">
                  {criterion.options.map((option) => {
                    const active = option.id === selectedId;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelectOption(criterion.id, option.id)}
                        className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-3 py-2 text-left text-xs font-semibold transition-all last:mr-0 sm:min-h-11 sm:shrink ${
                          active
                            ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-600/30'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
                        <span className="whitespace-normal break-words sm:whitespace-nowrap">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }

          if (isNumeric(criterion)) {
            const numericValue =
              typeof rawValue === 'number' && !Number.isNaN(rawValue) ? rawValue : '';
            return (
              <div
                key={criterion.id}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{criterion.label}</p>
                    {criterion.helperText && (
                      <p className="mt-1 text-xs text-slate-500">{criterion.helperText}</p>
                    )}
                    <div className="mt-2 max-w-full overflow-x-auto rounded-lg bg-slate-50/80 py-1.5 pl-1 pr-1 [-webkit-overflow-scrolling:touch] custom-scrollbar-x sm:mr-2">
                      <p className="min-w-max px-1 text-[11px] leading-relaxed text-slate-500">
                        <span className="font-semibold text-slate-500">Bands: </span>
                        {criterion.ranges
                          .map((r) => r.label ?? `${r.minValue ?? '–'}–${r.maxValue ?? '–'}`)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="w-full shrink-0 sm:w-28">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:sr-only">
                      Value
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-semibold text-slate-800 transition outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                      value={numericValue}
                      onChange={(e) => handleNumericChange(criterion.id, e.target.value)}
                      placeholder={criterion.unit || 'Value'}
                    />
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
      <ResultBanner totalScore={totalScore} activeBand={activeBand} />
    </div>
  );
};

