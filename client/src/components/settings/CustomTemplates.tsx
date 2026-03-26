import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { TemplateItem } from '../../../../shared/types';

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

  const fetchDemoTemplates = async () => {
    try {
      const apiUrl = import.meta.env.VITE_NOTES_API_URL ?? '';
      const cleanApiUrl = apiUrl.replace(/\/$/, '');
      const requestUrl = `${cleanApiUrl}/get_templates`;

      console.log('DEBUG: Exact URL being called:', requestUrl);

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: 'demo' }),
      });

      const rawText = await response.text();
      console.log('DEBUG - RAW SERVER RESPONSE:', rawText);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} - ${rawText}`);
      }

      if (!rawText || rawText === 'null' || rawText.trim() === '') {
        console.log('DEBUG: User has no templates (empty response).');
        setTemplates([]);
        return;
      }

      const data = JSON.parse(rawText);
      console.log('DEBUG: Parsed data from DB:', data);

      let templatesArray: TemplateItem[] = [];

      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'object' && value !== null) {
            const v = value as Record<string, unknown>;
            templatesArray.push({
              id: key,
              name: (v.name as string) || key.replace(/_/g, ' ').toUpperCase(),
              description: (v.description as string) || '',
              ...v,
            } as TemplateItem);
          }
        }
      } else if (Array.isArray(data)) {
        templatesArray = data as TemplateItem[];
      }

      console.log('DEBUG: Final Templates Array for UI:', templatesArray);
      setTemplates(templatesArray);
    } catch (err) {
      console.error('Fetch Error:', err);
      setError('Could not load templates. See console for details.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDemoTemplates();
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
        No templates found for the demo account.
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
