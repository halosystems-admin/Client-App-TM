import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { classifyMarkdownLine } from './markdownDocx';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraphXml(text: string, bold = false): string {
  const safe = escapeXml(text);
  const boldTag = bold ? '<w:b/>' : '';
  return `<w:p><w:r><w:rPr>${boldTag}</w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r></w:p>`;
}

function markdownToBodyXml(markdown: string): string {
  const parts: string[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const { kind, text } = classifyMarkdownLine(rawLine);
    if (kind === 'blank') {
      parts.push('<w:p/>');
      continue;
    }
    if (kind === 'h1' || kind === 'h2' || kind === 'h3') {
      parts.push(paragraphXml(text, true));
      continue;
    }
    if (kind === 'bullet') {
      parts.push(
        `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
      );
      continue;
    }
    parts.push(paragraphXml(text));
  }
  return parts.join('');
}

function extractSectionProperties(bodyInner: string): string {
  const match = /<w:sectPr[\s\S]*?<\/w:sectPr>\s*$/.exec(bodyInner);
  return match?.[0] ?? '';
}

/**
 * Resolve a local DOCX template path from halo-core config ref and/or template name.
 * Supports:
 * - local:D:\...\Template.docx (dev workstation)
 * - SCRIBE_DOCX_TEMPLATES_DIR + "{Template Name}.docx"
 * - server/assets/docx-templates/{Template Name}.docx (bundled for deploy)
 */
export function resolveScribeDocxTemplatePath(
  docxTemplateRef: string | null | undefined,
  templateName: string | null | undefined
): string | null {
  const candidates: string[] = [];

  const ref = (docxTemplateRef || '').trim();
  if (ref.startsWith('local:')) {
    candidates.push(ref.slice('local:'.length).trim());
  } else if (ref && !ref.startsWith('http')) {
    candidates.push(ref);
  }

  const name = (templateName || '').trim();
  if (name) {
    const fileName = `${name}.docx`;
    const envDir = (process.env.SCRIBE_DOCX_TEMPLATES_DIR || '').trim();
    if (envDir) {
      candidates.push(path.join(envDir, fileName));
    }
    candidates.push(path.join(__dirname, '..', 'assets', 'docx-templates', fileName));
    candidates.push(path.join(process.cwd(), 'server', 'assets', 'docx-templates', fileName));
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Copy an existing DOCX template and replace only the main document body content,
 * preserving headers, footers, styles, and section properties from the template shell.
 */
export async function renderMarkdownIntoDocxTemplate(
  templatePath: string,
  markdown: string
): Promise<Buffer> {
  const templateBuffer = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) {
    throw new Error('Template DOCX is missing word/document.xml');
  }

  const docXml = await docEntry.async('string');
  const bodyMatch = /<w:body>([\s\S]*?)<\/w:body>/.exec(docXml);
  if (!bodyMatch) {
    throw new Error('Template DOCX document.xml has no w:body element');
  }

  const bodyInner = bodyMatch[1];
  const sectPr = extractSectionProperties(bodyInner);
  const newBodyInner = `${markdownToBodyXml(markdown)}${sectPr}`;
  const updatedDocXml = docXml.replace(
    /<w:body>[\s\S]*?<\/w:body>/,
    `<w:body>${newBodyInner}</w:body>`
  );

  zip.file('word/document.xml', updatedDocXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function buildScribeExportFileName(templateName: string, extension: 'docx' | 'pdf' = 'docx'): string {
  const safeName = templateName.trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  return `${safeName || 'Scribe Output'} - ${dateStr}.${extension}`;
}
