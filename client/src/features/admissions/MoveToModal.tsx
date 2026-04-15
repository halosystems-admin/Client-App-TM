import React, { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { AdmissionsColumn } from '../../../../shared/types';

interface MoveToModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: AdmissionsColumn[];
  onMoveCard: (columnId: string) => void;
  currentColumnId?: string;
}

export default function MoveToModal({
  isOpen,
  onClose,
  columns,
  onMoveCard,
  currentColumnId,
}: MoveToModalProps) {
  if (!isOpen) return null;

  const availableColumns = columns.filter((col) => col.id !== currentColumnId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-white w-full sm:max-w-sm rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-200 px-4 py-3 flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors -ml-1.5"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h2 className="text-base font-semibold text-slate-900">Move patient</h2>
        </div>

        {/* Wards List */}
        <div className="flex-1 overflow-y-auto">
          {availableColumns.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-slate-400 text-sm">No available wards</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {availableColumns.map((column) => (
                <button
                  key={column.id}
                  onClick={() => {
                    onMoveCard(column.id);
                    onClose();
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium text-slate-900">{column.title}</p>
                    <p className="text-xs text-slate-500">{column.cards.length} patients</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer - safe area padding for mobile */}
        <div className="border-t border-slate-200 px-4 py-3 bg-slate-50">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
