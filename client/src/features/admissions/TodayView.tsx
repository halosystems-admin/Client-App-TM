import React from 'react';
import type { AdmissionsCard } from '../../../../shared/types';
import { AdmissionsPatientCard } from './AdmissionsPatientCard';
import { groupCardsForTodayView } from './admissionsUtils';

interface TodayViewProps {
  cards: AdmissionsCard[];
  onCardClick: (cardId: string, columnId?: string) => void;
  onMoveToClick?: (cardId: string) => void;
  onTriageColorChange?: (cardId: string, color: any) => void;
  now: number;
}

export default function TodayView({
  cards,
  onCardClick,
  onMoveToClick,
  onTriageColorChange,
  now,
}: TodayViewProps) {
  const groups = groupCardsForTodayView({ version: 0, updatedAt: new Date().toISOString(), columns: [{ id: '', title: '', cards }] }, now);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-4">
        {groups.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-slate-400">No active patients</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  {group.title} ({group.cards.length})
                </h3>
                <div className="space-y-2">
                  {group.cards.map((card) => (
                    <div
                      key={card.id}
                      className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 hover:shadow-sm transition-all"
                      onClick={() => onCardClick(card.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{card.patientName}</p>
                          <p className="text-sm text-slate-600 truncate">{card.diagnosis}</p>
                          {card.tasks.length > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                              {card.tasks.filter((t) => !t.done).length}/{card.tasks.length} tasks
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {onTriageColorChange && (
                            <div className="w-3 h-3 rounded-full bg-slate-300" />
                          )}
                          {onMoveToClick && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveToClick(card.id);
                              }}
                              className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded"
                            >
                              Move
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
