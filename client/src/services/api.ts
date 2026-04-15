import type {
  Patient,
  DriveFile,
  LabAlert,
  ChatMessage,
  UserSettings,
  TemplateItem,
  TemplateListResponse,
  GenerateNoteParams,
  AdmissionsBoard,
  CalendarEvent,
} from '../../../shared/types';

const API_BASE = import.meta.env.VITE_API_URL || '';
const NOTES_API_BASE = import.meta.env.VITE_NOTES_API_URL || '';

// --- Structured Error ---
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    const hint =
      !API_BASE && typeof window !== 'undefined'
        ? ' Cannot reach the API. Is the dev server running (npm run dev:server)?'
        : ' Check the network and that FRONTEND_URL (or CLIENT_URL) / CORS match your browser origin.';
    throw new ApiError(
      `${err instanceof Error ? err.message : 'Network error'}.${hint}`,
      0
    );
  }

  if (res.status === 401) {
    window.location.href = '/';
    throw new ApiError('Not authenticated', 401);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      `Server returned a non-JSON response (${res.status}). Please try again.`,
      res.status
    );
  }

  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

// --- AUTH ---
export const checkAuth = () =>
  request<{ signedIn: boolean; email?: string; user_id?: string; notesApiAvailable?: boolean }>('/api/auth/me');
export const logout = () => request('/api/auth/logout', { method: 'POST' });

/** Run note conversion scheduler now (txt→docx after 10h, docx→pdf after 24h). Requires jobs to be due. */
export const runSchedulerNow = () =>
  request<{ ok: boolean; message: string }>('/api/drive/run-scheduler', { method: 'POST' });

/** Check scheduler for pending conversion jobs */
export const getSchedulerStatus = () =>
  request<{ totalPending: number; totalDue: number; jobs: Array<{ fileId: string; status: string; savedAt: string }> }>(
    '/api/drive/scheduler-status'
  );

// --- PATIENTS (paginated) ---
interface PatientsResponse {
  patients: Patient[];
  nextPage: string | null;
}

export const fetchPatients = (page?: string): Promise<PatientsResponse> => {
  const params = new URLSearchParams();
  params.set('pageSize', '100');
  if (page) params.set('page', page);
  return request<PatientsResponse>(`/api/drive/patients?${params.toString()}`);
};

export async function fetchAllPatients(): Promise<Patient[]> {
  const all: Patient[] = [];
  let page: string | undefined;

  do {
    const data = await fetchPatients(page);
    all.push(...data.patients);
    page = data.nextPage ?? undefined;
  } while (page);

  return all;
}

export const createPatient = (name: string, dob: string, sex: 'M' | 'F') =>
  request<Patient>('/api/drive/patients', {
    method: 'POST',
    body: JSON.stringify({ name, dob, sex }),
  });

export const updatePatient = (id: string, updates: { name?: string; dob?: string; sex?: string }) =>
  request(`/api/drive/patients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

export const deletePatient = (id: string) =>
  request(`/api/drive/patients/${id}`, { method: 'DELETE' });

// --- FILES / FOLDER CONTENTS (paginated) ---
interface FilesResponse {
  files: DriveFile[];
  nextPage: string | null;
}

export const fetchFilesFirstPage = async (
  patientId: string,
  pageSize = 100
): Promise<{ files: DriveFile[]; nextPage: string | null }> => {
  const data = await request<FilesResponse>(
    `/api/drive/patients/${patientId}/files?pageSize=${pageSize}`
  );
  return { files: data.files || [], nextPage: data.nextPage ?? null };
};

export const fetchFiles = async (patientId: string): Promise<DriveFile[]> => {
  const all: DriveFile[] = [];
  let page: string | undefined;

  do {
    const data = await request<FilesResponse>(
      `/api/drive/patients/${patientId}/files?pageSize=100${page ? `&page=${encodeURIComponent(page)}` : ''}`
    );
    all.push(...data.files);
    page = data.nextPage ?? undefined;
  } while (page);

  return all;
};

// Fetch contents of any folder by its Drive ID (used for subfolder navigation)
export const fetchFolderContents = async (folderId: string): Promise<DriveFile[]> => {
  const all: DriveFile[] = [];
  let page: string | undefined;

  do {
    const data = await request<FilesResponse>(
      `/api/drive/patients/${folderId}/files?pageSize=100${page ? `&page=${encodeURIComponent(page)}` : ''}`
    );
    all.push(...data.files);
    page = data.nextPage ?? undefined;
  } while (page);

  return all;
};

export const uploadFile = async (patientId: string, file: File, customName?: string) => {
  const base64 = await fileToBase64(file);
  return request(`/api/drive/patients/${patientId}/upload`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: customName || file.name,
      fileType: file.type,
      fileData: base64,
    }),
  });
};

export const updateFileMetadata = (_patientId: string, fileId: string, newName: string) =>
  request(`/api/drive/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: newName }),
  });

export const deleteFile = (fileId: string) =>
  request(`/api/drive/files/${fileId}`, { method: 'DELETE' });

export const getFileDownloadUrl = (fileId: string) =>
  request<{ downloadUrl: string; viewUrl: string; name: string; mimeType: string }>(
    `/api/drive/files/${fileId}/download`
  );

export const saveNote = (
  patientId: string,
  content: string,
  opts?: { fileName?: string; folderPath?: string }
) =>
  request<{ success: boolean; folderId?: string }>(`/api/drive/patients/${patientId}/note`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      ...(opts?.fileName ? { fileName: opts.fileName } : {}),
      ...(opts?.folderPath ? { folderPath: opts.folderPath } : {}),
    }),
  });

export const createFolder = (parentId: string, name: string) =>
  request<DriveFile>(`/api/drive/patients/${parentId}/folder`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

// --- AI ---
export const generatePatientSummary = async (patientName: string, files: DriveFile[], patientId?: string): Promise<string[]> => {
  return request<string[]>('/api/ai/summary', {
    method: 'POST',
    body: JSON.stringify({ patientName, patientId, files }),
  });
};

export const extractLabAlerts = async (content: string): Promise<LabAlert[]> => {
  return request<LabAlert[]>('/api/ai/lab-alerts', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
};

export const analyzeAndRenameImage = async (base64Image: string): Promise<string> => {
  const data = await request<{ filename: string }>('/api/ai/analyze-image', {
    method: 'POST',
    body: JSON.stringify({ base64Image }),
  });
  return data.filename;
};

export const transcribeToSOAP = async (audioBase64: string, mimeType: string, customTemplate?: string): Promise<string> => {
  const data = await request<{ soapNote: string }>('/api/ai/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audioBase64, mimeType, customTemplate }),
  });
  return data.soapNote;
};

export const searchPatientsByConcept = async (
  query: string,
  patients: Patient[],
  files: Record<string, DriveFile[]>
): Promise<string[]> => {
  return request<string[]>('/api/ai/search', {
    method: 'POST',
    body: JSON.stringify({ query, patients, files }),
  });
};

export const askHalo = async (
  patientId: string,
  question: string,
  history: ChatMessage[]
): Promise<{ reply: string }> => {
  return request<{ reply: string }>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ patientId, question, history }),
  });
};

/**
 * Stream HALO chat response via SSE. Calls onChunk for each text chunk,
 * onComplete when done. Uses 90s timeout for slow Gemini responses.
 */
export const askHaloStream = async (
  patientId: string,
  question: string,
  history: ChatMessage[],
  onChunk: (text: string) => void
): Promise<void> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${API_BASE}/api/ai/chat-stream`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, question, history }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 401) {
      window.location.href = '/';
      throw new ApiError('Not authenticated', 401);
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(err.error || `Request failed (${res.status})`, res.status);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new ApiError('No response body', 500);

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data) as string;
            if (typeof parsed === 'string') onChunk(parsed);
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
};

// --- NOTES / TEMPLATES (via Express proxy when NOTES_API_URL is set) ---
const NOTES_BASE = `${API_BASE}/api/notes`;

/** Normalize API response to TemplateItem[] (handles { templates: [...] } or array or object of id->template). */
function normalizeTemplates(raw: unknown): TemplateItem[] {
  const str = (v: unknown): string | undefined =>
    v === null || v === undefined ? undefined : String(v);
  if (Array.isArray(raw)) {
    return raw.map((t) => ({
      id: typeof t?.id === 'string' ? t.id : String(t?.id ?? ''),
      name: str((t as Record<string, unknown>)?.name ?? (t as Record<string, unknown>)?.label),
      label: str((t as Record<string, unknown>)?.label ?? (t as Record<string, unknown>)?.name),
      type: (t as Record<string, unknown>)?.type as string | undefined,
      ...(typeof t === 'object' && t !== null ? (t as Record<string, unknown>) : {}),
    }));
  }
  if (raw && typeof raw === 'object' && 'templates' in (raw as Record<string, unknown>)) {
    return normalizeTemplates((raw as { templates: unknown }).templates);
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return Object.entries(obj).map(([id, t]) => {
      const row = typeof t === 'object' && t !== null ? (t as Record<string, unknown>) : {};
      return {
        id,
        name: str(row.name ?? row.label) ?? id,
        label: str(row.label ?? row.name) ?? id,
        type: row.type as string | undefined,
        ...row,
      };
    });
  }
  return [];
}

export async function getTemplates(userId: string): Promise<TemplateListResponse> {
  const data = await request<unknown>(`${NOTES_BASE}/get_templates`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
  return normalizeTemplates(data);
}

export async function generateNote(params: GenerateNoteParams): Promise<{ content?: string; blob?: Blob }> {
  const { return_type } = params;
  const res = await fetch(`${NOTES_BASE}/generate_note`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (res.status === 401) {
    window.location.href = '/';
    throw new ApiError('Not authenticated', 401);
  }
  const contentType = res.headers.get('content-type') || '';
  if (return_type === 'docx' && (contentType.includes('octet-stream') || contentType.includes('wordprocessing'))) {
    const blob = await res.blob();
    return { blob };
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      // use text as-is
    }
    throw new ApiError(msg, res.status);
  }
  try {
    const json = JSON.parse(text) as { content?: string };
    return { content: json.content ?? text };
  } catch {
    return { content: text };
  }
}

// --- SETTINGS ---
export const loadSettings = () =>
  request<{ settings: UserSettings | null }>('/api/drive/settings');

export const saveSettings = (settings: UserSettings) =>
  request<{ success: boolean }>('/api/drive/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

// --- CALENDAR ---

export const fetchTodayEvents = () =>
  request<{ events: CalendarEvent[] }>('/api/calendar/today');

export const fetchEventsInRange = (
  startIso: string,
  endIso: string,
  timeZone?: string
) => {
  const params = new URLSearchParams({ start: startIso, end: endIso });
  if (timeZone) params.set('timeZone', timeZone);
  return request<{ events: CalendarEvent[] }>(`/api/calendar/events?${params.toString()}`);
};

export const fetchCalendarEvent = (id: string) =>
  request<{ event: CalendarEvent }>(`/api/calendar/events/${encodeURIComponent(id)}`);

export interface CalendarEventCreatePayload {
  title: string;
  description?: string;
  start: string;
  end: string;
  timeZone?: string;
  location?: string;
  patientId?: string;
  attachmentFileIds?: string[];
}

export type CalendarEventUpdatePayload = Partial<CalendarEventCreatePayload>;

export interface CalendarEventDto {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  location?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
}

export const fetchCalendarEvents = async (params: {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}): Promise<CalendarEventDto[]> => {
  const searchParams = new URLSearchParams();
  if (params.timeMin) searchParams.set('timeMin', params.timeMin);
  if (params.timeMax) searchParams.set('timeMax', params.timeMax);
  if (params.maxResults) searchParams.set('maxResults', String(params.maxResults));

  const data = await request<{ events: CalendarEventDto[] }>(
    `/api/calendar/events${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
  );
  return data.events;
};

export function createCalendarEvent(payload: CalendarEventCreatePayload): Promise<{ event: CalendarEvent }>;
export function createCalendarEvent(payload: {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  location?: string;
}): Promise<CalendarEventDto>;
export async function createCalendarEvent(
  payload: CalendarEventCreatePayload | {
    summary: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    timeZone?: string;
    location?: string;
  }
): Promise<{ event: CalendarEvent } | CalendarEventDto> {
  const isLegacy = 'summary' in payload && 'startDateTime' in payload;
  if (isLegacy) {
    const data = await request<{ event: CalendarEventDto }>('/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.event;
  }

  return request<{ event: CalendarEvent }>('/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export const updateCalendarEvent = (id: string, payload: CalendarEventUpdatePayload) =>
  request<{ event: CalendarEvent }>(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteCalendarEvent = (id: string) =>
  request<void>(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const updateCalendarEventAttachments = (id: string, fileIds: string[]) =>
  request<{ event: CalendarEvent }>(`/api/calendar/events/${encodeURIComponent(id)}/attachments`, {
    method: 'POST',
    body: JSON.stringify({ fileIds }),
  });

export const generatePrepNote = (patientId: string, patientName: string) =>
  request<{ prepNote: string }>('/api/calendar/prep-note', {
    method: 'POST',
    body: JSON.stringify({ patientId, patientName }),
  });

// --- ADMISSIONS ---

export const fetchAdmissionsBoard = () =>
  request<{ board: AdmissionsBoard }>('/api/drive/admissions-board');

export const saveAdmissionsBoard = (board: AdmissionsBoard) =>
  request<{ board: AdmissionsBoard }>('/api/drive/admissions-board', {
    method: 'PUT',
    body: JSON.stringify(board),
  });

// --- UTILS ---
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
