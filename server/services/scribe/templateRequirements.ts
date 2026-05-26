import type { Pool } from 'pg';
import { resolveRelativeDateWord } from '../../utils/clinicalDate';

export type TemplateRequirementRecord = {
  key: string;
  display_label: string;
  type: string;
  required: boolean;
  doctor_hint: string | null;
  example_phrase: string | null;
  validation_rule_json: unknown;
  field_order: number;
};

export type ValidateRequirementsResult = {
  ok: boolean;
  detected: Record<string, string>;
  missing: Array<{ key: string; label: string; message: string }>;
};

/** Parsed from `validation_rule_json` for API + validation. */
export type ParsedValidationRule = {
  options: string[];
  synonyms: Record<string, string[]>;
};

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'was',
  'were',
  'has',
  'have',
  'had',
  'not',
  'are',
  'but',
  'all',
  'any',
  'can',
  'his',
  'her',
  'she',
  'him',
  'they',
  'you',
  'our',
  'who',
  'whom',
  'been',
  'being',
  'into',
  'over',
  'also',
  'than',
  'then',
  'there',
  'their',
  'will',
  'would',
  'could',
  'should',
  'patient',
]);

const POSITIVE_PHRASES = [
  'patient consented',
  'consent obtained',
  'patient agrees',
  'confirmed consent',
  'gave permission',
  'consented to',
] as const;

const NEGATIVE_PHRASES = [
  'patient refused',
  'declined consent',
  'did not consent',
  'consent not given',
  'refused consent',
] as const;

const PROXIMITY_WORDS = 10;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads `options` / `enumOptions` and `synonyms` from `validation_rule_json`.
 */
export function parseValidationRuleJson(rule: unknown): ParsedValidationRule {
  const o =
    rule && typeof rule === 'object' && !Array.isArray(rule) ? (rule as Record<string, unknown>) : {};
  const rawOpts = o.options ?? o.enumOptions;
  const options: string[] = Array.isArray(rawOpts)
    ? rawOpts.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
    : [];
  const synonyms: Record<string, string[]> = {};
  const rawSyn = o.synonyms;
  if (rawSyn && typeof rawSyn === 'object' && !Array.isArray(rawSyn)) {
    for (const [k, v] of Object.entries(rawSyn as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        synonyms[k] = v
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean);
      }
    }
  }
  return { options, synonyms };
}

function normalizeRequirementType(type: string): 'date' | 'boolean' | 'enum' | 'string' | 'unknown' {
  const t = (type || '').trim().toLowerCase();
  if (t === 'text') return 'string';
  if (t === 'date' || t === 'boolean' || t === 'enum' || t === 'string') return t;
  return 'unknown';
}

function tokenizeWords(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z0-9']+\b/g) ?? [];
}

function phraseToWords(phrase: string): string[] {
  return phrase.toLowerCase().match(/\b[a-z0-9']+\b/g) ?? [];
}

function findPhraseWordSpans(
  tokens: string[],
  phraseWords: string[]
): Array<{ start: number; end: number }> {
  if (phraseWords.length === 0) return [];
  const out: Array<{ start: number; end: number }> = [];
  for (let i = 0; i <= tokens.length - phraseWords.length; i++) {
    let ok = true;
    for (let j = 0; j < phraseWords.length; j++) {
      if (tokens[i + j] !== phraseWords[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      out.push({ start: i, end: i + phraseWords.length });
    }
  }
  return out;
}

function windowHasTopic(
  tokens: string[],
  spanStart: number,
  spanEnd: number,
  topics: string[]
): boolean {
  const lo = Math.max(0, spanStart - PROXIMITY_WORDS);
  const hi = Math.min(tokens.length, spanEnd + PROXIMITY_WORDS);
  const slice = tokens.slice(lo, hi);
  return topics.some((t) => slice.includes(t));
}

function topicTokensFromRequirement(key: string, label: string): string[] {
  const out: string[] = [];
  for (const part of key.split('_')) {
    const w = part.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (w.length >= 3 && !STOPWORDS.has(w)) out.push(w);
  }
  const labelWords = label.toLowerCase().match(/\b[a-z0-9']+\b/g) ?? [];
  for (const w of labelWords) {
    if (w.length >= 3 && !STOPWORDS.has(w)) out.push(w);
  }
  return [...new Set(out)];
}

function detectBoolean(req: TemplateRequirementRecord, transcript: string): string | null {
  const tokens = tokenizeWords(transcript);
  if (tokens.length === 0) return null;

  const topics = topicTokensFromRequirement(req.key, req.display_label);
  if (topics.length === 0) return null;

  let foundPos = false;
  let foundNeg = false;

  for (const phrase of POSITIVE_PHRASES) {
    const pw = phraseToWords(phrase);
    for (const { start, end } of findPhraseWordSpans(tokens, pw)) {
      if (windowHasTopic(tokens, start, end, topics)) {
        foundPos = true;
      }
    }
  }

  for (const phrase of NEGATIVE_PHRASES) {
    const pw = phraseToWords(phrase);
    for (const { start, end } of findPhraseWordSpans(tokens, pw)) {
      if (windowHasTopic(tokens, start, end, topics)) {
        foundNeg = true;
      }
    }
  }

  if (foundPos && foundNeg) return null;
  if (foundPos) return 'true';
  if (foundNeg) return 'false';
  return null;
}

function detectEnum(req: TemplateRequirementRecord, transcript: string): string | null {
  const { options, synonyms } = parseValidationRuleJson(req.validation_rule_json);
  if (options.length === 0) return null;

  const matchedCanonical = new Set<string>();

  for (const opt of options) {
    const re = new RegExp(`\\b${escapeRegex(opt)}\\b`, 'i');
    if (re.test(transcript)) {
      matchedCanonical.add(opt);
    }
  }

  for (const [canonical, alts] of Object.entries(synonyms)) {
    if (!options.includes(canonical)) continue;
    for (const alt of alts) {
      if (alt.length < 2) continue;
      const re = new RegExp(`\\b${escapeRegex(alt)}\\b`, 'i');
      if (re.test(transcript)) {
        matchedCanonical.add(canonical);
      }
    }
  }

  if (matchedCanonical.size === 1) {
    return [...matchedCanonical][0];
  }
  return null;
}

function extractReferringDoctorLike(transcript: string): string | null {
  const patterns = [
    /(?:referring|referrer)\s+(?:doctor|physician|specialist)\s+(?:is|was)\s*[:\s,-]*\s*(?:Dr\.?\s+)?([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,5})/i,
    /(?:referred\s+by|referral\s+from)\s*[:\s,-]*\s*(?:Dr\.?\s+)?([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,5})/i,
    /(?:referring|referrer)\s+(?:doctor|physician)\s*[:\s,-]+\s*(?:Dr\.?\s+)?([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,5})/i,
  ];

  const junk = /^(need|add|the|a|an|to|will|must|should|can|could|would|today|later)$/i;

  for (const re of patterns) {
    const m = re.exec(transcript);
    if (m?.[1]) {
      let v = m[1].trim().replace(/\s+/g, ' ');
      v = v.replace(/[.,;:!?'"]+$/g, '').trim();
      if (v.length >= 2 && !junk.test(v)) {
        return v;
      }
    }
  }
  return null;
}

function detectString(req: TemplateRequirementRecord, transcript: string): string | null {
  const rule =
    req.validation_rule_json && typeof req.validation_rule_json === 'object' && !Array.isArray(req.validation_rule_json)
      ? (req.validation_rule_json as Record<string, unknown>)
      : {};
  const stringKind = typeof rule.stringKind === 'string' ? rule.stringKind.trim() : '';

  if (stringKind === 'referring_doctor' || /referr/i.test(req.key) || /referr/i.test(req.display_label)) {
    return extractReferringDoctorLike(transcript);
  }

  return null;
}

/**
 * Parses a single date fragment into YYYY-MM-DD when unambiguous.
 * Supports ISO, DD/MM/YYYY, MM/DD/YYYY heuristics, and "3 February 2026".
 */
export function parseDateFragment(fragment: string): string | null {
  const raw = fragment.trim();
  if (!raw) return null;

  const relative = resolveRelativeDateWord(raw);
  if (relative) return relative;

  const iso = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(raw);
  if (iso) {
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
  }

  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/.exec(raw);
  if (dmy) {
    let a = Number(dmy[1]);
    let b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const dMonY = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})\b/i.exec(raw);
  if (dMonY) {
    const day = Number(dMonY[1]);
    const monKey = dMonY[2].toLowerCase();
    const year = Number(dMonY[3]);
    const monthIdx = MONTH_NAMES[monKey];
    if (monthIdx !== undefined && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;
    }
  }

  const monDY = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(raw);
  if (monDY) {
    const monKey = monDY[1].toLowerCase();
    const day = Number(monDY[2]);
    const year = Number(monDY[3]);
    const monthIdx = MONTH_NAMES[monKey];
    if (monthIdx !== undefined && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;
    }
  }

  return null;
}

function extractDateForRequirementKey(key: string, transcript: string): string | null {
  const text = transcript.trim();
  if (!text) return null;

  if (key === 'date' || key === 'encounter_date' || key === 'note_date') {
    if (/\b(?:date\s+)?today\b/i.test(text)) {
      const relative = resolveRelativeDateWord('today');
      if (relative) return relative;
    }
    const dateLine = /(?:^|\n)\s*date\s*(?:is|:)?\s*([^\n,.;]+)/i.exec(text);
    if (dateLine) {
      const d = parseDateFragment(dateLine[1]);
      if (d) return d;
    }
  }

  const fromTo = /\bfrom\s+([^,\n;]+?)\s+to\s+([^,\n;]+)/i.exec(text);
  if (fromTo) {
    const left = parseDateFragment(fromTo[1]);
    const right = parseDateFragment(fromTo[2]);
    if (key === 'leave_start_date' && left) return left;
    if (key === 'leave_end_date' && right) return right;
  }

  if (key === 'leave_end_date') {
    const until = /\buntil\s+([^,\n;.]+)/i.exec(text);
    if (until) {
      const d = parseDateFragment(until[1]);
      if (d) return d;
    }
  }

  if (key === 'leave_start_date') {
    const startPhrase =
      /(?:sick\s+leave|leave)\s+(?:from|starting|starts?|start|beginning)\s+([^\n,.;]+)/i.exec(text);
    if (startPhrase) {
      const d = parseDateFragment(startPhrase[1]);
      if (d) return d;
    }
    if (fromTo) {
      const d = parseDateFragment(fromTo[1]);
      if (d) return d;
    }
  }

  if (key === 'leave_end_date' && fromTo) {
    const d = parseDateFragment(fromTo[2]);
    if (d) return d;
  }

  if (key === 'resume_duty_date') {
    const resume =
      /(?:resume\s+duty|return\s+to\s+work|back\s+to\s+work)\s*(?:on|from)?\s*[:\-]?\s*([^\n,.;]+)/i.exec(
        text
      );
    if (resume) {
      const d = parseDateFragment(resume[1]);
      if (d) return d;
    }
    const dutyOn = /\bduty\s+on\s+([^\n,.;]+)/i.exec(text);
    if (dutyOn) {
      const d = parseDateFragment(dutyOn[1]);
      if (d) return d;
    }
  }

  return null;
}

function detectValueForRequirement(req: TemplateRequirementRecord, transcript: string): string | null {
  const type = normalizeRequirementType(req.type);

  switch (type) {
    case 'date':
      return extractDateForRequirementKey(req.key, transcript);
    case 'boolean':
      return detectBoolean(req, transcript);
    case 'enum':
      return detectEnum(req, transcript);
    case 'string':
      return detectString(req, transcript);
    default:
      return null;
  }
}

export function validateTranscriptAgainstRequirements(input: {
  transcript: string;
  requirements: TemplateRequirementRecord[];
}): ValidateRequirementsResult {
  const transcript = input.transcript.trim();
  const detected: Record<string, string> = {};
  const missing: Array<{ key: string; label: string; message: string }> = [];

  for (const req of input.requirements) {
    if (!req.required) continue;

    const type = normalizeRequirementType(req.type);
    if (type === 'unknown') {
      missing.push({
        key: req.key,
        label: req.display_label,
        message: `Unsupported or missing requirement type for "${req.display_label}".`,
      });
      continue;
    }

    const value = detectValueForRequirement(req, transcript);
    if (value !== null && value !== '') {
      detected[req.key] = value;
    } else {
      missing.push({
        key: req.key,
        label: req.display_label,
        message: `The dictation did not clearly include "${req.display_label}".`,
      });
    }
  }

  return {
    ok: missing.length === 0,
    detected,
    missing,
  };
}

export async function getTemplateRequirements(
  pool: Pool,
  practiceId: string,
  templateIdInput: string
): Promise<{ resolvedTemplateId: string; requirements: TemplateRequirementRecord[] }> {
  const templateRes = await pool.query<{ id: string }>(
    `
      SELECT id::text
      FROM scribe_templates
      WHERE practice_id::text = $1
        AND (id::text = $2 OR firebase_template_id = $2)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [practiceId, templateIdInput]
  );

  if (templateRes.rows.length === 0) {
    throw new Error('No matching scribe template found for practiceId/templateId.');
  }

  const resolvedTemplateId = templateRes.rows[0].id;

  const reqRes = await pool.query<TemplateRequirementRecord>(
    `
      SELECT
        key,
        display_label,
        type,
        required,
        doctor_hint,
        example_phrase,
        validation_rule_json,
        field_order
      FROM scribe_template_requirements
      WHERE template_id::text = $1
      ORDER BY field_order ASC NULLS LAST, created_at ASC
    `,
    [resolvedTemplateId]
  );

  return {
    resolvedTemplateId,
    requirements: reqRes.rows,
  };
}
