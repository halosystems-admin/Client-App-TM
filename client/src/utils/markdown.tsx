import React from 'react';
import { renderInlineMarkdown } from './formatting';

function normalizeLine(rawLine: string): string {
  return rawLine.replace(/\r$/, '');
}

/** True when value should use markdown rendering instead of a plain textarea. */
export function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s/m.test(text) || /^\s*[-*+]\s/m.test(text) || /\*\*.+\*\*/m.test(text);
}

/** Safe subset renderer for Scribe clinical note markdown (no raw HTML). */
export function renderMarkdown(text: string): React.ReactNode {
  if (!text.trim()) {
    return <p className="text-slate-400 italic">Empty note...</p>;
  }

  return text.split(/\r?\n/).map((rawLine, idx) => {
    const line = normalizeLine(rawLine);

    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      return (
        <h3 key={idx} className="mt-3 mb-1 text-base font-bold text-slate-700">
          {renderInlineMarkdown(h3[1])}
        </h3>
      );
    }

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      return (
        <h2 key={idx} className="mt-4 mb-2 text-lg font-bold text-slate-800">
          {renderInlineMarkdown(h2[1])}
        </h2>
      );
    }

    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      return (
        <h1 key={idx} className="mt-4 mb-2 text-xl font-bold text-slate-900">
          {renderInlineMarkdown(h1[1])}
        </h1>
      );
    }

    if (/^\s*[\*\-]\s/.test(line)) {
      const content = line.replace(/^\s*[\*\-]\s/, '');
      return (
        <li key={idx} className="mb-1 ml-5 list-disc text-slate-700">
          {renderInlineMarkdown(content)}
        </li>
      );
    }
    if (line.trim() === '') {
      return <div key={idx} className="h-2" aria-hidden />;
    }
    return (
      <p key={idx} className="mb-1 text-slate-700">
        {renderInlineMarkdown(line)}
      </p>
    );
  });
}

/** Plain-text snippet for list cards (no raw ### or ** in the UI). */
export function markdownToPlainTextPreview(markdown: string, maxLen = 140): string {
  const parts: string[] = [];

  for (const rawLine of markdown.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/^#{1,6}\s+/, '');
    line = line.replace(/^\s*[-*+]\s+/, '');
    line = line.replace(/\*\*(.+?)\*\*/g, '$1');
    line = line.replace(/`([^`]+)`/g, '$1');
    if (line) parts.push(line);
    if (parts.join(' · ').length >= maxLen) break;
  }

  const collapsed = parts.join(' · ').replace(/\s+/g, ' ').trim();
  if (!collapsed) return 'Finalized note';
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen)}…`;
}
