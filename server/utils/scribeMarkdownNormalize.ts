import { resolveRelativeDateWord, toIsoDateLocal } from './clinicalDate';

const TODAY_LITERAL = /^(today|today'?s\s+date)\.?$/i;

function resolveDateFromContext(
  systemFields: Record<string, string | null> | undefined,
  extracted: Record<string, string> | undefined,
  reference: Date
): string | null {
  const fromSystem =
    systemFields?.date?.trim() ||
    systemFields?.encounter_date?.trim() ||
    systemFields?.consultation_date?.trim() ||
    null;
  if (fromSystem) {
    return fromSystem;
  }

  const fromExtracted =
    extracted?.date?.trim() ||
    extracted?.encounter_date?.trim() ||
    null;
  if (fromExtracted) {
    const relative = resolveRelativeDateWord(fromExtracted, reference);
    return relative ?? fromExtracted;
  }

  return toIsoDateLocal(reference);
}

/**
 * Replaces literal "Today" under a ### Date heading with a resolved ISO/system date.
 */
export function normalizeScribeMarkdownDates(
  markdown: string,
  options: {
    systemFields?: Record<string, string | null>;
    extractedTemplateVariables?: Record<string, string> | null;
    referenceDate?: Date;
  } = {}
): string {
  const reference = options.referenceDate ?? new Date();
  const resolvedDate = resolveDateFromContext(
    options.systemFields,
    options.extractedTemplateVariables ?? undefined,
    reference
  );
  if (!resolvedDate) {
    return markdown;
  }

  const lines = markdown.split(/\r?\n/);
  let inDateSection = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (/^###\s+date\s*$/i.test(trimmed)) {
      inDateSection = true;
      continue;
    }

    if (inDateSection) {
      if (/^#{1,6}\s/.test(trimmed)) {
        inDateSection = false;
        continue;
      }
      if (TODAY_LITERAL.test(trimmed) || trimmed === '') {
        if (TODAY_LITERAL.test(trimmed)) {
          lines[i] = resolvedDate;
        }
        inDateSection = false;
        continue;
      }
      inDateSection = false;
    }
  }

  return lines.join('\n');
}
