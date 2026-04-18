import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { TemplateItem } from '../../../../shared/types';
import { getCachedTemplates, getTemplatesUiState } from '../../services/api';

export function CustomTemplates() {
  const [templates, setTemplates] = useState<TemplateItem[]>(() => getCachedTemplates() ?? []);
  const [loading, setLoading] = useState(() => getCachedTemplates() === null);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string>('No templates found for your HALO account.');

  const fetchTemplates = async () => {
    try {
      const state = await getTemplatesUiState(true);
      setTemplates(state.templates);
      setEmptyMessage(state.message || 'No templates found for your HALO account.');
      if (state.status === 'needs-halo-setup' || state.status === 'upstream-failure' || state.status === 'error') {
        setError(state.message || 'Could not load templates. See console for details.');
      } else {
        setError(null);
      }
    } catch (err) {
      console.error('Fetch Error:', err);
      setError('Could not load templates. See console for details.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cachedTemplates = getCachedTemplates();
    if (cachedTemplates) {
      setTemplates(cachedTemplates);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetchTemplates();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 p-4">
        <Loader2 size={16} className="animate-spin text-teal-500" />
        Loading templates…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 space-y-2" role="alert">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(null);
            void fetchTemplates();
          }}
          className="text-xs font-medium text-teal-700 hover:text-teal-800"
        >
          Retry
        </button>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-sm text-slate-500">{emptyMessage}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchTemplates();
          }}
          className="text-xs font-medium text-teal-700 hover:text-teal-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {templates.map((t) => {
        const name = t.name ?? t.label ?? 'Untitled Template';
        const description = (t as Record<string, unknown>).description;
        const descStr = typeof description === 'string' ? description : description != null ? String(description) : null;
        return (
          <div
            key={t.id}
            className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-white shadow-sm hover:border-slate-300 transition-colors"
          >
            <p className="text-sm font-medium text-slate-800 break-words">{name}</p>
            {descStr ? (
              <p className="text-xs text-slate-500 mt-1 break-words">{descStr}</p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">—</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
