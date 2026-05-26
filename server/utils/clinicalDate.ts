/** Deterministic clinical date formatting (no locale ambiguity for tests). */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatClinicalDate(date: Date, dateFormat: string | null | undefined): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const fmt = (dateFormat || 'YYYY-MM-DD').trim().toUpperCase();

  if (fmt === 'DD-MM-YYYY' || fmt === 'DD/MM/YYYY') {
    return `${d}-${m}-${y}`;
  }
  if (fmt === 'MM/DD/YYYY' || fmt === 'MM-DD-YYYY') {
    return `${m}/${d}/${y}`;
  }
  return `${y}-${m}-${d}`;
}

export function formatClinicalTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** ISO calendar date from a Date in local server timezone. */
export function toIsoDateLocal(date: Date): string {
  return formatClinicalDate(date, 'YYYY-MM-DD');
}

export function resolveRelativeDateWord(fragment: string, reference: Date = new Date()): string | null {
  const lower = fragment.trim().toLowerCase();
  if (lower === 'today') {
    return toIsoDateLocal(reference);
  }
  if (lower === 'tomorrow') {
    const next = new Date(reference);
    next.setDate(next.getDate() + 1);
    return toIsoDateLocal(next);
  }
  if (lower === 'yesterday') {
    const prev = new Date(reference);
    prev.setDate(prev.getDate() - 1);
    return toIsoDateLocal(prev);
  }
  return null;
}
