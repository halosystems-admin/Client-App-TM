type JsonPrimitive = string | number | boolean | null;

interface JsonObject {
  [key: string]: JsonValue;
}

type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface StructuredNoteField {
  path: string[];
  key: string;
  label: string;
  value: string;
  multiline: boolean;
}

export interface StructuredNoteModel {
  raw: JsonObject;
  fields: StructuredNoteField[];
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettifyLabel(path: string[], templateId?: string): string {
  const rawKey = path[path.length - 1] || '';
  const lowerPath = path.map((part) => part.toLowerCase()).join('.');
  const lowerTemplate = (templateId || '').toLowerCase();

  if (lowerTemplate.includes('op_note')) {
    if (lowerPath.endsWith('operative_diagnosis')) return 'Diagnosis';
    if (lowerPath.endsWith('postoperative_instructions')) return 'Postoperative Instructions';
  }

  if (lowerTemplate.includes('soap')) {
    if (lowerPath.endsWith('subjective')) return 'Subjective';
    if (lowerPath.endsWith('objective')) return 'Objective';
    if (lowerPath.endsWith('assessment')) return 'Assessment';
    if (lowerPath.endsWith('plan')) return 'Plan';
  }

  return humanizeKey(rawKey);
}

function isLeafValue(value: JsonValue): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function shouldRenderMultiline(label: string, value: string): boolean {
  return value.length > 90 || value.includes('\n') || /instructions|assessment|plan|history|summary|description/i.test(label);
}

function normalizeInput(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function unwrapGeneratedPayload(parsed: unknown): unknown {
  if (isPlainObject(parsed) && parsed.mode === 'note' && 'note' in parsed) {
    return parsed.note;
  }
  return parsed;
}

function collectFields(
  value: JsonValue,
  path: string[],
  templateId?: string,
  out: StructuredNoteField[] = [],
  depth = 0
): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return false;
  }

  for (const [key, child] of entries) {
    const childPath = [...path, key];

    if (isLeafValue(child)) {
      const label = prettifyLabel(childPath, templateId);
      out.push({
        path: childPath,
        key,
        label,
        value: child === null ? '' : String(child),
        multiline: shouldRenderMultiline(label, child === null ? '' : String(child)),
      });
      continue;
    }

    if (Array.isArray(child)) {
      return false;
    }

    if (isPlainObject(child)) {
      const nestedEntries = Object.entries(child);
      if (nestedEntries.every(([, nested]) => isLeafValue(nested))) {
        for (const [nestedKey, nestedValue] of nestedEntries) {
          const nestedPath = [...childPath, nestedKey];
          const label = prettifyLabel(nestedPath, templateId);
          out.push({
            path: nestedPath,
            key: nestedKey,
            label,
            value: nestedValue === null ? '' : String(nestedValue),
            multiline: shouldRenderMultiline(label, nestedValue === null ? '' : String(nestedValue)),
          });
        }
        continue;
      }

      if (depth >= 1) {
        return false;
      }

      const nestedOk = collectFields(child, childPath, templateId, out, depth + 1);
      if (!nestedOk) return false;
      continue;
    }

    return false;
  }

  return true;
}

function cloneJsonObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setDeepValue(root: JsonObject, path: string[], nextValue: string): JsonObject {
  const cloned = cloneJsonObject(root);
  let cursor: Record<string, JsonValue> = cloned;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const existing = cursor[segment];
    if (!isPlainObject(existing)) {
      cursor[segment] = {} as JsonValue;
    }
    cursor = cursor[segment] as Record<string, JsonValue>;
  }

  cursor[path[path.length - 1]] = nextValue;
  return cloned;
}

export function parseStructuredNote(rawText: string, templateId?: string): StructuredNoteModel | null {
  const parsed = normalizeInput(rawText);
  const unwrapped = unwrapGeneratedPayload(parsed);

  if (!isPlainObject(unwrapped)) return null;

  const rootCandidate = isPlainObject(unwrapped.note_content) ? unwrapped.note_content : unwrapped;
  const root = cloneJsonObject(rootCandidate);
  const fields: StructuredNoteField[] = [];
  const ok = collectFields(root, [], templateId, fields);

  if (!ok || fields.length === 0) return null;

  return { raw: root, fields };
}

export function serializeStructuredNote(root: JsonObject): string {
  return JSON.stringify(root, null, 2);
}

export function updateStructuredNoteField(
  model: StructuredNoteModel,
  path: string[],
  nextValue: string
): StructuredNoteModel {
  const raw = setDeepValue(model.raw, path, nextValue);
  const fields = model.fields.map((field) =>
    field.path.join('.') === path.join('.')
      ? {
          ...field,
          value: nextValue,
          multiline: shouldRenderMultiline(field.label, nextValue),
        }
      : field
  );
  return { raw, fields };
}

export function isStructuredNote(rawText: string): boolean {
  return parseStructuredNote(rawText) !== null;
}
