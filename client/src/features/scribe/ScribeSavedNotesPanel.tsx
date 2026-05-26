import React, { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import type { ScribeFinalizedNote } from '../../../../shared/types';
import { markdownToPlainTextPreview } from '../../utils/markdown';

interface Props {
  notes: ScribeFinalizedNote[];
  loading: boolean;
  selectedOutputId: string | null;
  onSelect: (note: ScribeFinalizedNote) => void;
  /** When false, history is hidden behind a compact toggle (publish-ready default). */
  defaultOpen?: boolean;
}

export const ScribeSavedNotesPanel: React.FC<Props> = ({
  notes,
  loading,
  selectedOutputId,
  onSelect,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  if (!loading && notes.length === 0) {
    return null;
  }

  const selectedNote = selectedOutputId
    ? notes.find((n) => n.outputId === selectedOutputId) ?? null
    : null;

  const countLabel = loading ? '…' : String(notes.length);

  return (
    <div className="shrink-0 border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs transition hover:bg-slate-50"
        aria-expanded={open}
      >
        <History className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
        <span className="font-semibold text-slate-700">Scribe history</span>
        <span className="text-slate-500">
          ({countLabel} finalized)
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-slate-500">
            Finalized Scribe notes for this patient — stored in Supabase, not Google Drive. Unfinalized
            attempts will move to Settings → Recovery in a future phase.
          </p>
          {loading ? (
            <p className="text-xs text-slate-500">Loading finalized notes…</p>
          ) : (
            <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {notes.map((note) => {
                const isSelected = selectedOutputId === note.outputId;
                const plainPreview = markdownToPlainTextPreview(note.finalMarkdown);
                return (
                  <li key={note.outputId}>
                    <button
                      type="button"
                      onClick={() => onSelect(note)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                        isSelected
                          ? 'border-teal-300 bg-teal-50/80'
                          : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {note.templateName || note.firebaseTemplateId || 'Scribe note'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(note.finalizedAt).toLocaleString()}
                        </span>
                        {note.doctorEdited ? (
                          <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                            Edited
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-slate-600">{plainPreview}</p>
                      {isSelected ? (
                        <p className="mt-1.5 text-[10px] font-medium text-teal-700">
                          Open in Clinical Note Editor below — use Edit or Preview there.
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] text-slate-400">Click to open in editor</p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedNote && (
            <p className="rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2 text-xs text-teal-900">
              <span className="font-semibold">Note loaded in editor.</span> Full content is in the Clinical
              Note Editor below.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
