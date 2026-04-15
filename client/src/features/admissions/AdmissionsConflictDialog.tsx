import React from 'react';
import { AlertCircle } from 'lucide-react';

interface AdmissionsConflictDialogProps {
  isOpen: boolean;
  onKeepLocal: () => void;
  onReloadLatest: () => void;
}

export default function AdmissionsConflictDialog({
  isOpen,
  onKeepLocal,
  onReloadLatest,
}: AdmissionsConflictDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6">
        <div className="flex gap-3 mb-4">
          <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-slate-900">Board updated by another user</h3>
            <p className="text-sm text-slate-600 mt-1">
              Someone else modified the admissions board. Keep your edits or reload the latest version?
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onReloadLatest}
            className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 text-slate-900 font-medium hover:bg-slate-50 transition-colors"
          >
            Reload latest
          </button>
          <button
            onClick={onKeepLocal}
            className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Keep my edits
          </button>
        </div>
      </div>
    </div>
  );
}
