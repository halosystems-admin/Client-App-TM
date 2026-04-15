import React from 'react';
import type { AdmissionsColumn, Patient } from '../../../../shared/types';
import { ArrowLeft, CheckCircle2, Plus, Search, X } from 'lucide-react';

interface Props {
  open: boolean;
  boardColumns: AdmissionsColumn[];
  filteredPatientResults: Patient[];
  newCardPatientId: string;
  newCardSearch: string;
  newCardSearchChange: (value: string) => void;
  newCardPatientIdChange: (id: string) => void;
  newCardColumnId: string | null;
  newCardColumnIdChange: (id: string) => void;
  newCardDiagnosis: string;
  newCardDiagnosisChange: (value: string) => void;
  newCardDoctorsInput: string;
  newCardDoctorsInputChange: (value: string) => void;
  newCardTagsInput: string;
  newCardTagsInputChange: (value: string) => void;
  onClose: () => void;
  onCreateCard: () => void;
}

export const AdmissionsAddPatientModal: React.FC<Props> = ({
  open,
  boardColumns,
  filteredPatientResults,
  newCardPatientId,
  newCardSearch,
  newCardSearchChange,
  newCardPatientIdChange,
  newCardColumnId,
  newCardColumnIdChange,
  newCardDiagnosis,
  newCardDiagnosisChange,
  newCardDoctorsInput,
  newCardDoctorsInputChange,
  newCardTagsInput,
  newCardTagsInputChange,
  onClose,
  onCreateCard,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] md:items-center md:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admissions-add-patient-title"
        className="flex h-[100dvh] w-full max-w-2xl flex-col rounded-none border border-slate-200 bg-white shadow-2xl md:h-auto md:max-h-[90vh] md:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 md:hidden"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
            <h2 id="admissions-add-patient-title" className="text-lg font-semibold text-slate-900">
              Add admitted patient
            </h2>
            <p className="mt-0.5 text-sm text-cyan-600 font-medium">Link an existing patient folder to a ward card.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 border-l-2 border-l-cyan-500 pl-2">
              <span className="text-cyan-600">🔍</span>
              Find patient
            </label>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" />
              <input
                value={newCardSearch}
                onChange={(event) => newCardSearchChange(event.target.value)}
                placeholder="Search name, DOB, or folder number..."
                className="h-11 w-full rounded-lg border border-slate-200 bg-cyan-50/50 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-cyan-50"
              />
            </label>
          </div>

          <div className="max-h-[34vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/70 p-2 md:max-h-[240px]">
            {filteredPatientResults.length > 0 ? (
              <div className="space-y-1.5">
                {filteredPatientResults.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => newCardPatientIdChange(patient.id)}
                    className={`flex w-full items-center justify-between rounded-lg border-l-4 px-3 py-2.5 text-left transition ${
                      newCardPatientId === patient.id
                        ? 'border-l-cyan-500 border border-cyan-200 bg-cyan-50 text-cyan-900 shadow-md'
                        : 'border-l-slate-300 border border-slate-200 bg-white hover:border-l-cyan-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-semibold ${newCardPatientId === patient.id ? 'text-cyan-900' : 'text-slate-900'}`}>
                        {patient.name}
                      </p>
                      <p className={`mt-0.5 text-xs ${newCardPatientId === patient.id ? 'text-cyan-700' : 'text-slate-400'}`}>
                        {patient.dob}
                        {patient.folderNumber ? ` · ${patient.folderNumber}` : ''}
                        {patient.idNumber ? ` · ${patient.idNumber}` : ''}
                      </p>
                    </div>
                    {newCardPatientId === patient.id && <CheckCircle2 className="h-4 w-4 text-cyan-600" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No matching patients available.</div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 border-l-2 border-l-cyan-500 pl-2">
                <span className="text-cyan-600">📋</span>
                Admitting diagnosis
              </label>
              <input
                value={newCardDiagnosis}
                onChange={(event) => newCardDiagnosisChange(event.target.value)}
                placeholder="#Sepsis"
                className="h-11 w-full rounded-lg border border-slate-200 bg-cyan-50/40 px-3 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-cyan-50"
              />
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 border-l-2 border-l-blue-500 pl-2">
                <span className="text-blue-600">🏥</span>
                Initial ward
              </label>
              <select
                value={newCardColumnId || ''}
                onChange={(event) => newCardColumnIdChange(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-blue-50/40 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-blue-50"
              >
                {boardColumns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 border-l-2 border-l-purple-500 pl-2">
                <span className="text-purple-600">👨‍⚕️</span>
                Co-managing doctors
              </label>
              <input
                value={newCardDoctorsInput}
                onChange={(event) => newCardDoctorsInputChange(event.target.value)}
                placeholder="Dr Smith, Dr Jones"
                className="h-11 w-full rounded-lg border border-slate-200 bg-purple-50/40 px-3 text-sm text-slate-700 outline-none transition focus:border-purple-300 focus:bg-purple-50"
              />
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 border-l-2 border-l-amber-500 pl-2">
                <span className="text-amber-600">🏷️</span>
                Tags
              </label>
              <input
                value={newCardTagsInput}
                onChange={(event) => newCardTagsInputChange(event.target.value)}
                placeholder="critical, bloods"
                className="h-11 w-full rounded-lg border border-slate-200 bg-amber-50/40 px-3 text-sm text-slate-700 outline-none transition focus:border-amber-300 focus:bg-amber-50"
              />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-100 bg-white px-4 py-3 pb-safe md:px-6 md:py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreateCard}
            disabled={!newCardPatientId || !newCardColumnId}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create card
          </button>
        </div>
      </div>
    </div>
  );
};
