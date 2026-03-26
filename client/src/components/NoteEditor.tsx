import React from 'react';
import { Save } from 'lucide-react';
import { AppStatus } from '../../../shared/types';
import { renderInlineMarkdown } from '../utils/formatting';

interface NoteEditorProps {
  noteContent: string;
  onNoteContentChange: (content: string) => void;
  editMode: 'write' | 'preview';
  onEditModeChange: (mode: 'write' | 'preview') => void;
  status: AppStatus;
  onSave: () => void;
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
}) => {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clinical Note Editor</span>
        <div className="flex items-center gap-2">
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
      {editMode === 'write' ? (
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
      <div className="shrink-0 bg-slate-50 border-t border-slate-200 p-4 flex justify-start">
        <button onClick={onSave} disabled={status === AppStatus.FILING || status === AppStatus.SAVING || !noteContent} className="flex items-center gap-2 bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium transition-all shadow-sm">
          <Save className="w-4 h-4" /> {status === AppStatus.FILING ? 'Filing...' : 'Save Note'}
        </button>
      </div>
    </div>
  );
};
