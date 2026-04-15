import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { TemplateItem } from '../../../../shared/types';
import { ApiError } from '../../services/api';
import { getTemplates } from '../../services/api';

function normalizeTemplates(raw: unknown): TemplateItem[] {
  const str = (v: unknown): string | undefined =>
    v === null || v === undefined ? undefined : String(v);
  if (Array.isArray(raw)) {
    return raw.map((t) => ({
      id: typeof (t as Record<string, unknown>)?.id === 'string' ? (t as Record<string, unknown>).id as string : String((t as Record<string, unknown>)?.id ?? ''),
      name: (t as Record<string, unknown>)?.name as string | undefined ?? (t as Record<string, unknown>)?.label as string | undefined,
      label: (t as Record<string, unknown>)?.label as string | undefined ?? (t as Record<string, unknown>)?.name as string | undefined,
      type: (t as Record<string, unknown>)?.type as string | undefined,
      ...(typeof t === 'object' && t !== null ? (t as Record<string, unknown>) : {}),
    }));
  }
  if (raw && typeof raw === 'object' && 'templates' in (raw as Record<string, unknown>)) {
    return normalizeTemplates((raw as { templates: unknown }).templates);
  }
  // Firebase object: { "id1": {...}, "id2": {...} } -> array with id from key
  if (raw && typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return Object.entries(obj).map(([id, t]) => {
      const row = typeof t === 'object' && t !== null ? (t as Record<string, unknown>) : {};
      return {
        id,
        name: str(row.name ?? row.label) ?? id,
        label: str(row.label ?? row.name) ?? id,
        type: row.type as string | undefined,
        ...row,
      } as TemplateItem;
    });
  }
  return [];
}

export function CustomTemplates() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      const templatesArray = await getTemplates();
      setTemplates(templatesArray);
    } catch (err) {
      console.error('Fetch Error:', err);
      if (err instanceof ApiError && err.status === 401) {
        setError('Session expired. Please sign in again to load templates.');
      } else {
        setError('Could not load templates. See console for details.');
      }
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
      <p className="text-sm text-red-600 p-4" role="alert">
        {error}
      </p>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-slate-500 p-4">
        No templates found for your account.
      </p>
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
