import React from 'react';
import { Save, Wand2 } from 'lucide-react';
import { AppStatus } from '../../../shared/types';
import { renderInlineMarkdown } from '../utils/formatting';
import {
  parseStructuredNote,
  serializeStructuredNote,
  updateStructuredNoteField,
} from '../utils/structuredNote';

interface NoteEditorProps {
  noteContent: string;
  onNoteContentChange: (content: string) => void;
  editMode: 'write' | 'preview';
  onEditModeChange: (mode: 'write' | 'preview') => void;
  status: AppStatus;
  onSave: () => void;
  onDiscard: () => void;
  activeTemplateLabel?: string;
  activeTemplateId?: string;
  onChangeTemplate?: () => void;
  onPopulateMemo?: () => void;
  populateMemoLoading?: boolean;
  canSaveNote?: boolean;
}

function renderMarkdown(text: string) {
  if (!text) return <p className="text-slate-400 italic">Empty note...</p>;
  return text.split('\n').map((line, idx) => {
    if (line.startsWith('## ')) {
      return <h2 key={idx} className="text-lg font-bold text-slate-800 mt-4 mb-2">{renderInlineMarkdown(line.slice(3))}</h2>;
    }
    if (line.startsWith('### ')) {
      return <h3 key={idx} className="text-base font-bold text-slate-700 mt-3 mb-1">{renderInlineMarkdown(line.slice(4))}</h3>;
    }
    if (line.startsWith('# ')) {
      return <h1 key={idx} className="text-xl font-bold text-slate-900 mt-4 mb-2">{renderInlineMarkdown(line.slice(2))}</h1>;
    }
    if (/^\s*[\*\-]\s/.test(line)) {
      const content = line.replace(/^\s*[\*\-]\s/, '');
      return <li key={idx} className="ml-5 mb-1 text-slate-700 list-disc">{renderInlineMarkdown(content)}</li>;
    }
    if (line.trim() === '') {
      return <div key={idx} className="h-2" />;
    }
    return <p key={idx} className="mb-1 text-slate-700">{renderInlineMarkdown(line)}</p>;
  });
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  noteContent, onNoteContentChange, editMode, onEditModeChange, status, onSave,
  onDiscard, activeTemplateLabel, activeTemplateId, onChangeTemplate, onPopulateMemo,
  populateMemoLoading = false, canSaveNote = false,
}) => {
  const hasDraft = noteContent.trim().length > 0;
  const structuredNote = parseStructuredNote(noteContent, activeTemplateId);

  const handleFieldChange = (path: string[], nextValue: string) => {
    if (!structuredNote) return;
    const updated = updateStructuredNoteField(structuredNote, path, nextValue);
    onNoteContentChange(serializeStructuredNote(updated.raw));
  };

  const renderStructuredEditor = (readOnly: boolean) => (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white to-slate-50/50 p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Generated Memo</p>
          <p className="mt-1 text-sm text-slate-500">
            Edit the sections below directly. Changes stay in sync with the saved note.
          </p>
        </div>
        {readOnly && (
          <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-700">
            Preview
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:gap-4">
        {structuredNote?.fields.map((field) => {
          const commonClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15';
          return (
            <div key={field.path.join('.')} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="text-sm font-semibold text-slate-700">{field.label}</label>
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{field.key}</span>
              </div>
              {field.multiline ? (
                <textarea
                  value={field.value}
                  readOnly={readOnly}
                  onChange={(e) => handleFieldChange(field.path, e.target.value)}
                  rows={readOnly ? Math.max(2, Math.min(8, field.value.split('\n').length + 1)) : 4}
                  className={`${commonClass} resize-none leading-relaxed ${readOnly ? 'bg-slate-50 text-slate-700' : ''}`}
                />
              ) : (
                <input
                  type="text"
                  value={field.value}
                  readOnly={readOnly}
                  onChange={(e) => handleFieldChange(field.path, e.target.value)}
                  className={`${commonClass} ${readOnly ? 'bg-slate-50 text-slate-700' : ''}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clinical Note Editor</span>
          {activeTemplateLabel && (
            <span className="max-w-[220px] truncate rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 border border-teal-100">
              Template: {activeTemplateLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onChangeTemplate && (
            <button
              onClick={onChangeTemplate}
              className="px-3 py-1 rounded-md text-xs font-bold text-slate-600 hover:text-teal-700 hover:bg-teal-50 transition-all"
            >
              Change template
            </button>
          )}
          <div className="flex bg-slate-200 p-0.5 rounded-lg">
            <button
              onClick={() => onEditModeChange('write')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${editMode === 'write' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Edit
            </button>
            <button
              onClick={() => onEditModeChange('preview')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${editMode === 'preview' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Preview
            </button>
          </div>
        </div>
      </div>
      {structuredNote ? (
        editMode === 'write' ? (
          renderStructuredEditor(false)
        ) : (
          renderStructuredEditor(true)
        )
      ) : editMode === 'write' ? (
        <textarea
          value={noteContent}
          onChange={(e) => onNoteContentChange(e.target.value)}
          placeholder="Start typing or use the Scribe button to dictate..."
          className="min-h-0 flex-1 w-full resize-none overflow-y-auto p-6 font-mono text-sm leading-relaxed text-slate-700 focus:outline-none"
        />
      ) : (
        <div className="min-h-0 flex-1 w-full overflow-y-auto bg-white p-6">
          <div className="prose prose-sm prose-slate max-w-none">{renderMarkdown(noteContent)}</div>
        </div>
      )}
      <div className="shrink-0 bg-slate-50 border-t border-slate-200 p-4 flex justify-start gap-3">
        <button onClick={onDiscard} disabled={!noteContent} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-2 font-medium text-slate-600 transition-all hover:bg-slate-100 disabled:opacity-50">
          Discard
        </button>
        {onPopulateMemo && (
          <button
            onClick={onPopulateMemo}
            disabled={populateMemoLoading || !hasDraft}
            className="flex items-center gap-2 rounded-lg border border-teal-200 bg-white px-6 py-2 font-medium text-teal-700 transition-all hover:bg-teal-50 disabled:opacity-50"
          >
            <Wand2 className={`w-4 h-4 ${populateMemoLoading ? 'animate-spin' : ''}`} />
            {populateMemoLoading ? 'Populating...' : 'Populate Memo'}
          </button>
        )}
        <button onClick={onSave} disabled={status === AppStatus.FILING || status === AppStatus.SAVING || !noteContent || !canSaveNote} className="flex items-center gap-2 bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium transition-all shadow-sm">
          <Save className="w-4 h-4" /> {status === AppStatus.FILING ? 'Filing...' : 'Save Note'}
        </button>
      </div>
    </div>
  );
};
