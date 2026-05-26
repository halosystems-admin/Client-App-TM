/**
 * Shared markdown line classification for DOCX export (no HTML).
 */

export type MarkdownLineKind = 'h1' | 'h2' | 'h3' | 'blank' | 'bullet' | 'paragraph';

export type ClassifiedMarkdownLine = {
  kind: MarkdownLineKind;
  text: string;
};

export function classifyMarkdownLine(rawLine: string): ClassifiedMarkdownLine {
  const line = rawLine.replace(/\r$/, '');
  const trimmed = line.trim();

  if (!trimmed) {
    return { kind: 'blank', text: '' };
  }

  const h3 = trimmed.match(/^###\s+(.*)$/);
  if (h3) {
    return { kind: 'h3', text: h3[1].trim() };
  }

  const h2 = trimmed.match(/^##\s+(.*)$/);
  if (h2) {
    return { kind: 'h2', text: h2[1].trim() };
  }

  const h1 = trimmed.match(/^#\s+(.*)$/);
  if (h1) {
    return { kind: 'h1', text: h1[1].trim() };
  }

  const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
  if (bullet) {
    return { kind: 'bullet', text: bullet[1].trim() };
  }

  return { kind: 'paragraph', text: trimmed };
}
