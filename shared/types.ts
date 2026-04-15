// Shared types used by both client and server

export interface Patient {
  id: string;
  name: string;
  dob: string;
  sex: 'M' | 'F';
  lastVisit: string;
  alerts: string[];
  medicalAid?: string;
  medicalAidPlan?: string;
  medicalAidNumber?: string;
  folderNumber?: string;
  idNumber?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  thumbnail?: string;
  createdTime: string;
}

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface LabAlert {
  parameter: string;
  value: string;
  severity: 'high' | 'medium' | 'low';
  context: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

export enum AppStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  UPLOADING = 'uploading',
  ANALYZING = 'analyzing',
  SAVING = 'saving',
  FILING = 'filing',
}

export interface UserModulesSettings {
  admissions: boolean;
}

export type AdmissionsViewMode = 'board' | 'today' | 'critical' | 'discharge';

export interface AdmissionsSettingsData {
  defaultView?: AdmissionsViewMode;
  hiddenWardIds?: string[];
  staffTriageColors?: Record<string, TriageColor>;
}

export const DEFAULT_ADMISSIONS_SETTINGS: AdmissionsSettingsData = {
  defaultView: 'board',
  hiddenWardIds: [],
  staffTriageColors: {},
};

export interface UserSettings {
  // Profile (mandatory)
  firstName: string;
  lastName: string;
  profession: string;
  department: string;
  // Profile (optional)
  city: string;
  postalCode: string;
  university: string;
  // Template (legacy + HALO)
  noteTemplate: 'soap' | 'custom';
  customTemplateContent: string;
  customTemplateName: string;
  templateId?: string;
  haloUserId?: string;
  modules?: UserModulesSettings;
  admissionsSettings?: AdmissionsSettingsData;
  // Keep backward compatibility with current scoring UX controls.
  showScoringInBottomNav?: boolean;
}

export const DEFAULT_USER_MODULES: UserModulesSettings = {
  admissions: false,
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  firstName: '',
  lastName: '',
  profession: '',
  department: '',
  city: '',
  postalCode: '',
  university: '',
  noteTemplate: 'soap',
  customTemplateContent: '',
  customTemplateName: '',
  templateId: 'clinical_note',
  modules: DEFAULT_USER_MODULES,
  admissionsSettings: DEFAULT_ADMISSIONS_SETTINGS,
  showScoringInBottomNav: true,
};

export function normalizeUserSettings(value: Partial<UserSettings> | null | undefined): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...(value || {}),
    modules: {
      ...DEFAULT_USER_MODULES,
      ...(value?.modules || {}),
    },
    admissionsSettings: {
      ...DEFAULT_ADMISSIONS_SETTINGS,
      ...(value?.admissionsSettings || {}),
    },
  };
}

export interface NoteField {
  label: string;
  body: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface HaloNote {
  noteId: string;
  title: string;
  content: string;
  template_id: string;
  lastSavedAt?: string;
  dirty?: boolean;
  fields?: NoteField[];
  rawData?: JsonValue;
}

export interface ScribeSessionNote {
  noteId: string;
  title: string;
  content: string;
  template_id: string;
  fields?: NoteField[];
  rawData?: JsonValue;
}

export interface CalendarAttachment {
  fileId: string;
  name?: string;
  url?: string;
  mimeType?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId?: string;
  start: string;
  end: string;
  title: string;
  description?: string;
  location?: string;
  patientId?: string;
  color?: string;
  attachments?: CalendarAttachment[];
  extendedProps?: Record<string, string>;
}

export interface ScribeSession {
  id: string;
  patientId: string;
  createdAt: string;
  transcript: string;
  context?: string;
  templates?: string[];
  noteTitles?: string[];
  notes?: ScribeSessionNote[];
  mainComplaint?: string;
}

export interface PatientSummaryTimelineEntry {
  id: string;
  sourceId: string;
  sourceType: 'file' | 'consultation';
  title: string;
  dateLabel: string;
  happenedAt: string;
  bullets: string[];
  sourceName?: string;
}

export interface PatientSummaryProcessedSource {
  sourceId: string;
  sourceType: 'file' | 'consultation';
  sourceName: string;
  sourceUpdatedAt: string;
  processedAt: string;
}

export interface PatientSummaryState {
  version: number;
  patientId: string;
  patientName: string;
  lastUpdatedAt: string | null;
  dirty: boolean;
  snapshot: string[];
  timeline: PatientSummaryTimelineEntry[];
  processedSources: Record<string, PatientSummaryProcessedSource>;
}

export interface AdmissionsTask {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface AdmissionsCardMovement {
  columnId: string;
  columnTitle: string;
  enteredAt: string;
  exitedAt?: string;
}

export type TriageColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'gray';

export interface AdmissionsCard {
  id: string;
  patientId: string;
  patientName: string;
  folderNumber?: string;
  diagnosis: string;
  coManagingDoctors: string[];
  tags: string[];
  tasks: AdmissionsTask[];
  enteredColumnAt: string;
  createdAt: string;
  updatedAt: string;
  movementHistory: AdmissionsCardMovement[];
  triageColor?: TriageColor;
}

export interface AdmissionsColumn {
  id: string;
  title: string;
  cards: AdmissionsCard[];
}

export interface AdmissionsBoard {
  version: number;
  updatedAt: string;
  columns: AdmissionsColumn[];
}

// --- Notes / templates (FastAPI) ---
export interface TemplateItem {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  [key: string]: unknown;
}

export type TemplateListResponse = TemplateItem[];

export interface GenerateNoteParams {
  template_id: string;
  text: string;
  return_type: 'note' | 'docx';
}

export interface GenerateNoteResponse {
  content?: string;
}
