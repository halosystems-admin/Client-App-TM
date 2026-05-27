import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  Patient,
  DriveFile,
  LabAlert,
  BreadcrumbItem,
  ChatMessage,
  TemplateItem,
  ScribeTemplate,
  ScribeFinalizedNote,
} from '../../../shared/types';
import { AppStatus, FOLDER_MIME_TYPE } from '../../../shared/types';

import {
  fetchFiles,
  fetchFolderContents,
  uploadFile,
  saveNote,
  finalizeScribeOutput,
  updatePatient,
  updateFileMetadata,
  generatePatientSummary,
  analyzeAndRenameImage,
  extractLabAlerts,
  deleteFile,
  createFolder,
  askHaloStream,
  generateNote,
  generateScribeDraft,
  getCachedTemplates,
  getTemplatesUiState,
  getScribeTemplates,
  getScribeFinalizedNotes,
  ApiError,
} from '../services/api';
import {
  Upload, CheckCircle2, ChevronLeft, Loader2,
  CloudUpload, Pencil, X, Trash2, FolderOpen, MessageCircle,
  FolderPlus, ChevronRight, Users, ClipboardList, FileText,
} from 'lucide-react';
import { SmartSummary } from '../features/smart-summary/SmartSummary';
import { LabAlerts } from '../features/lab-alerts/LabAlerts';
import { UniversalScribe } from '../features/scribe/UniversalScribe';
import { ScribeSavedNotesPanel } from '../features/scribe/ScribeSavedNotesPanel';
import { ScoringModule } from '../features/scoring/ScoringModule';
import { FileViewer } from '../components/FileViewer';
import { FileBrowser } from '../components/FileBrowser';
import { NoteEditor } from '../components/NoteEditor';
import { PatientChat } from '../components/PatientChat';
import { getErrorMessage, normalizePatientSummaryBullets } from '../utils/formatting';
import { parseStructuredNote } from '../utils/structuredNote';
import { useMediaQuery } from '../hooks/useMediaQuery';

const LAST_TEMPLATE_KEY = 'halo_lastTemplateId';
const SOAP_BUILTIN_TEMPLATE: TemplateItem = {
  id: 'soap_builtin',
  name: 'SOAP Note',
  label: 'SOAP Note',
  type: 'soap',
};

interface Props {
  patient: Patient;
  onBack: () => void;
  /** Opens patient list drawer on small screens (< md). */
  onOpenPatientsList?: () => void;
  onDataChange: () => void;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  customTemplate?: string;
  userId?: string;
  practiceId?: string;
  notesApiAvailable?: boolean;
  launchContext?: {
    tab?: 'overview' | 'notes' | 'chat' | 'sessions';
    freshSession?: boolean;
  } | null;
  /** When false, Scoring is hidden from the compact bottom nav only (lg+ tabs unchanged). */
  showScoringInBottomNav?: boolean;
}

export const PatientWorkspace: React.FC<Props> = ({
  patient,
  onBack,
  onOpenPatientsList,
  onDataChange,
  onToast,
  customTemplate,
  userId,
  practiceId,
  notesApiAvailable,
  launchContext,
  showScoringInBottomNav = true,
}) => {
  const enableLegacyPopulateMemo = import.meta.env.VITE_ENABLE_LEGACY_POPULATE_MEMO === 'true';
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [summary, setSummary] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<LabAlert[]>([]);
  const [noteContent, setNoteContent] = useState("");
  const [scribeOutputId, setScribeOutputId] = useState<string | null>(null);
  const [scribeOriginalMarkdown, setScribeOriginalMarkdown] = useState('');
  const [scribeGenerating, setScribeGenerating] = useState(false);
  const [scribeSaving, setScribeSaving] = useState(false);
  const [scribeError, setScribeError] = useState<string | null>(null);
  type ScribeMissingGuidance = {
    templateId: string;
    missing: Array<{ key: string; label: string; message: string }>;
    detected: Record<string, string>;
  };
  const [scribeMissingGuidance, setScribeMissingGuidance] = useState<ScribeMissingGuidance | null>(null);
  const [scribeRequirementAddendum, setScribeRequirementAddendum] = useState('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'chat' | 'scoring'>('overview');
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const isLg = useMediaQuery('(min-width: 1024px)');
  const [editMode, setEditMode] = useState<'write' | 'preview'>('write');
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showAiPanel, setShowAiPanel] = useState(true);
  /** True until smart summary is resolved (cache or API), independent of folder list loading. */
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);

  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string>(patient.id);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: patient.id, name: patient.name },
  ]);

  const [editingPatient, setEditingPatient] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editSex, setEditSex] = useState<'M' | 'F'>('M');

  const [editingFile, setEditingFile] = useState<DriveFile | null>(null);
  const [editFileName, setEditFileName] = useState("");

  const [fileToDelete, setFileToDelete] = useState<DriveFile | null>(null);

  // File viewer state
  const [viewingFile, setViewingFile] = useState<DriveFile | null>(null);

  // Chat state — use a ref to always have the latest messages for API calls
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLongWait, setChatLongWait] = useState(false);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const chatLongWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  chatMessagesRef.current = chatMessages;

  // Create folder state
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Upload destination picker state
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string>(patient.id);
  const [uploadTargetLabel, setUploadTargetLabel] = useState<string>(patient.name);
  const [uploadPickerFolders, setUploadPickerFolders] = useState<DriveFile[]>([]);
  const [uploadPickerLoading, setUploadPickerLoading] = useState(false);
  const [generateNoteLoading, setGenerateNoteLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Template / editor workflow state
  const [activeTemplate, setActiveTemplate] = useState<TemplateItem | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateModalMode, setTemplateModalMode] = useState<'record' | 'save' | 'typed'>('save');
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [scribeTemplates, setScribeTemplates] = useState<ScribeTemplate[]>([]);
  const [scribeTemplatesLoading, setScribeTemplatesLoading] = useState(false);
  const [scribeTemplatesError, setScribeTemplatesError] = useState<string | null>(null);
  const [finalizedScribeNotes, setFinalizedScribeNotes] = useState<ScribeFinalizedNote[]>([]);
  const [finalizedScribeNotesLoading, setFinalizedScribeNotesLoading] = useState(false);
  const [selectedFinalizedNoteId, setSelectedFinalizedNoteId] = useState<string | null>(null);
  const selectedTemplateIdRef = useRef<string | null>(null);
  const pendingRecordStartRef = useRef<(() => void) | null>(null);
  const pendingPopulateMemoSourceRef = useRef<string | null>(null);
  const [populateMemoHasBeenCalled, setPopulateMemoHasBeenCalled] = useState(false);
  const scribeConsultationIdRef = useRef<string | null>(null);

  const normalizeTemplates = (raw: unknown): TemplateItem[] => {
    if (!raw) return [];
    // Handle array of templates
    if (Array.isArray(raw)) {
      return raw as TemplateItem[];
    }
    // Handle Firebase-style object map { id: { ...template } }
    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as Record<string, unknown>;
      return Object.entries(obj).map(([id, value]) => {
        const v = (value as Record<string, unknown>) || {};
        return {
          id,
          name: (v.name as string) || (v.label as string) || id,
          label: (v.label as string) || (v.name as string) || id,
          type: v.type as string | undefined,
          ...v,
        } as TemplateItem;
      });
    }
    return [];
  };

  const isFolder = (file: DriveFile): boolean => file.mimeType === FOLDER_MIME_TYPE;

  const isSoapTemplate = (template: TemplateItem | null | undefined): boolean => {
    if (!template) return false;
    if (template.id === SOAP_BUILTIN_TEMPLATE.id) return true;
    const type = String(template.type || '').toLowerCase();
    const name = String(template.name || template.label || '').toLowerCase();
    return type === 'soap' || name.includes('soap');
  };

  const isPostgresUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const resolveScribeTemplateId = (template: TemplateItem): string | null => {
    if (template.id === SOAP_BUILTIN_TEMPLATE.id) {
      const mappedSoapTemplate = scribeTemplates.find(
        (item) => item.is_streamable && item.name.toLowerCase().includes('soap')
      );
      return mappedSoapTemplate?.id || '77777777-7777-7777-7777-777777777777';
    }

    if (isPostgresUuid(template.id)) {
      return template.id;
    }

    const mapped = scribeTemplates.find((item) => item.firebase_template_id === template.id);
    if (mapped?.id) {
      return mapped.id;
    }

    // Generate API also accepts firebase_template_id when the UI list still uses Firebase ids.
    return template.id;
  };

  const findScribeMetaForTemplate = (template: TemplateItem): ScribeTemplate | null => {
    const resolvedId = resolveScribeTemplateId(template);
    if (!resolvedId) return null;
    return (
      scribeTemplates.find((item) => item.id === resolvedId) ??
      scribeTemplates.find((item) => item.firebase_template_id === template.id) ??
      scribeTemplates.find((item) => item.firebase_template_id === resolvedId) ??
      null
    );
  };

  const clearScribeDraft = () => {
    setScribeOutputId(null);
    setScribeOriginalMarkdown('');
    setScribeGenerating(false);
    setScribeSaving(false);
    setScribeError(null);
    setScribeMissingGuidance(null);
    setScribeRequirementAddendum('');
    setPopulateMemoHasBeenCalled(false);
    scribeConsultationIdRef.current = null;
  };

  // Load folder contents (with loading indicator)
  const loadFolderContents = useCallback(async (folderId: string) => {
    setStatus(AppStatus.LOADING);
    try {
      const contents = folderId === patient.id
        ? await fetchFiles(patient.id)
        : await fetchFolderContents(folderId);
      setFiles(contents);
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
    setStatus(AppStatus.IDLE);
  }, [patient.id, onToast]);

  // Silent refresh (no loading indicator — used for periodic polling)
  const silentRefresh = useCallback(async () => {
    try {
      const contents = currentFolderId === patient.id
        ? await fetchFiles(patient.id)
        : await fetchFolderContents(currentFolderId);
      setFiles(contents);
    } catch {
      // Silent — don't show errors for background refreshes
    }
  }, [currentFolderId, patient.id]);

  useEffect(() => {
    if (isLg) setChatSheetOpen(false);
  }, [isLg]);

  useEffect(() => {
    if (!isLg && activeTab === 'chat') {
      setChatSheetOpen(true);
      setActiveTab('overview');
    }
  }, [isLg, activeTab]);

  useEffect(() => {
    if (!isLg && !showScoringInBottomNav && activeTab === 'scoring') {
      setActiveTab('overview');
    }
  }, [isLg, showScoringInBottomNav, activeTab]);

  // Poll for external changes every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      silentRefresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [silentRefresh]);

  // Clean up upload progress interval on unmount
  useEffect(() => {
    return () => {
      if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
    };
  }, []);

  // Initial load + AI summary (only at root patient folder)
  // Initial load + AI summary (only at root patient folder)
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setStatus(AppStatus.LOADING);
      setSummaryLoading(true);
      setSummaryUnavailable(false);
      setSummary([]);
      setAlerts([]);
      setChatMessages([]);
      setChatInput("");
      setNoteContent("");
      clearScribeDraft();
      setUploadMessage(null);
      setEditMode('write');
      setActiveTemplate(null);
      setSelectedTemplateId(null);
      setActiveTab('overview');
      setChatSheetOpen(false);
      setCurrentFolderId(patient.id);
      setBreadcrumbs([{ id: patient.id, name: patient.name }]);

      try {
        const pFiles = await fetchFiles(patient.id);
        if (!isMounted) return;
        setFiles(pFiles);

        if (pFiles.length === 0) {
          if (isMounted) setSummaryLoading(false);
          setStatus(AppStatus.IDLE);
          return;
        }

        // --- CACHING MAGIC FOR SMART SUMMARY ---
        const summaryCacheKey = `halo_summary_${patient.id}`;
        const cachedSummary = sessionStorage.getItem(summaryCacheKey);

        if (cachedSummary) {
          // 1. We found it in memory! Load it instantly.
          if (isMounted) {
            try {
              const bullets = normalizePatientSummaryBullets(JSON.parse(cachedSummary));
              setSummary(bullets);
              setSummaryUnavailable(bullets.length === 0);
            } catch {
              setSummary([]);
              setSummaryUnavailable(true);
            }
            setSummaryLoading(false);
          }
        } else {
          // 2. Not in memory. Ask Gemini to generate it, then save it!
          generatePatientSummary(patient.name, pFiles, patient.id)
            .then((res) => {
              if (!isMounted) return;
              const bullets = normalizePatientSummaryBullets(res);
              setSummary(bullets);
              setSummaryUnavailable(bullets.length === 0);
              if (bullets.length > 0) {
                sessionStorage.setItem(summaryCacheKey, JSON.stringify(bullets));
              }
            })
            .catch(() => {
              if (isMounted) {
                setSummary([]);
                setSummaryUnavailable(true);
              }
            })
            .finally(() => {
              if (isMounted) setSummaryLoading(false);
            });
        }

        // --- CACHING MAGIC FOR LAB ALERTS ---
        const alertCacheKey = `halo_alerts_${patient.id}`;
        const cachedAlerts = sessionStorage.getItem(alertCacheKey);

        if (cachedAlerts) {
          if (isMounted) setAlerts(JSON.parse(cachedAlerts));
        } else {
          const labFiles = pFiles.filter(f =>
            f.name.toLowerCase().includes('lab') ||
            f.name.toLowerCase().includes('blood') ||
            f.name.toLowerCase().includes('result')
          );

          if (labFiles.length > 0) {
            const labContext = labFiles.map(f => f.name).join(', ');
            extractLabAlerts(`Patient files indicate lab results: ${labContext}`).then(res => {
              if (isMounted) {
                setAlerts(res);
                sessionStorage.setItem(alertCacheKey, JSON.stringify(res));
              }
            }).catch(() => {});
          }
        }
      } catch (err) {
        if (isMounted) {
          onToast(getErrorMessage(err), 'error');
        }
      }

      if (isMounted) setStatus(AppStatus.IDLE);
    };

    loadData();
    return () => { isMounted = false; };
  }, [patient.id, patient.name, onToast]);

  useEffect(() => {
    if (!launchContext) return;

    if (launchContext.freshSession) {
      setActiveTemplate(null);
      setSelectedTemplateId(null);
      setNoteContent('');
      clearScribeDraft();
      setChatMessages([]);
      setChatInput('');
      setEditMode('write');
    }

    if (launchContext.tab === 'chat') {
      if (isLg) {
        setChatSheetOpen(false);
        setActiveTab('chat');
      } else {
        setChatSheetOpen(true);
        setActiveTab('overview');
      }
      return;
    }

    if (launchContext.tab) {
      setChatSheetOpen(false);
      setActiveTab(launchContext.tab === 'sessions' ? 'overview' : launchContext.tab);
    }
  }, [launchContext, isLg]);

  const loadFinalizedScribeNotes = useCallback(async () => {
    if (!patient?.id) {
      setFinalizedScribeNotes([]);
      return;
    }
    setFinalizedScribeNotesLoading(true);
    try {
      const notes = await getScribeFinalizedNotes(patient.id, practiceId);
      setFinalizedScribeNotes(notes);
    } catch (err) {
      console.error('[scribe-finalized-notes] load failed', err);
      setFinalizedScribeNotes([]);
    } finally {
      setFinalizedScribeNotesLoading(false);
    }
  }, [patient.id, practiceId]);

  // Load scribe templates from Supabase (for SOAP resolution)
  useEffect(() => {
    setScribeTemplatesLoading(true);
    setScribeTemplatesError(null);
    getScribeTemplates()
      .then((templates) => {
        setScribeTemplates(templates);
        setScribeTemplatesError(null);
      })
      .catch((err) => {
        console.error('[scribe-templates] load failed', err);
        setScribeTemplates([]);
        setScribeTemplatesError(
          getErrorMessage(err) || 'Scribe templates could not be loaded.'
        );
      })
      .finally(() => {
        setScribeTemplatesLoading(false);
      });
  }, [practiceId]);

  useEffect(() => {
    void loadFinalizedScribeNotes();
  }, [loadFinalizedScribeNotes]);

  // Navigate into a subfolder
  const navigateToFolder = async (folder: DriveFile) => {
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    await loadFolderContents(folder.id);
  };

  const navigateBack = async () => {
    if (breadcrumbs.length <= 1) return;
    const newBreadcrumbs = breadcrumbs.slice(0, -1);
    const parentId = newBreadcrumbs[newBreadcrumbs.length - 1].id;
    setBreadcrumbs(newBreadcrumbs);
    setCurrentFolderId(parentId);
    await loadFolderContents(parentId);
  };

  const navigateToBreadcrumb = async (index: number) => {
    if (index === breadcrumbs.length - 1) return;
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    const targetId = newBreadcrumbs[newBreadcrumbs.length - 1].id;
    setBreadcrumbs(newBreadcrumbs);
    setCurrentFolderId(targetId);
    await loadFolderContents(targetId);
  };

  // Upload destination picker
  const openUploadPicker = async () => {
    setUploadTargetFolderId(currentFolderId);
    setUploadTargetLabel(breadcrumbs[breadcrumbs.length - 1]?.name || patient.name);
    setShowUploadPicker(true);
    setUploadPickerLoading(true);
    try {
      const contents = currentFolderId === patient.id
        ? await fetchFiles(patient.id)
        : await fetchFolderContents(currentFolderId);
      setUploadPickerFolders(contents.filter(f => f.mimeType === FOLDER_MIME_TYPE));
    } catch {
      setUploadPickerFolders([]);
    }
    setUploadPickerLoading(false);
  };

  const selectUploadFolder = async (folder: DriveFile) => {
    setUploadTargetFolderId(folder.id);
    setUploadTargetLabel(folder.name);
    setUploadPickerLoading(true);
    try {
      const contents = await fetchFolderContents(folder.id);
      setUploadPickerFolders(contents.filter(f => f.mimeType === FOLDER_MIME_TYPE));
    } catch {
      setUploadPickerFolders([]);
    }
    setUploadPickerLoading(false);
  };

  const confirmUploadDestination = () => {
    setShowUploadPicker(false);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const targetId = uploadTargetFolderId;

    setStatus(AppStatus.UPLOADING);
    setUploadProgress(10);
    setUploadMessage(`Uploading ${file.name}...`);

    // Track interval in a ref so it's cleaned up on unmount
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
    uploadIntervalRef.current = setInterval(() => {
      setUploadProgress(prev => (prev >= 90 ? 90 : prev + 10));
    }, 200);

    await new Promise(r => setTimeout(r, 2000));
    if (uploadIntervalRef.current) {
      clearInterval(uploadIntervalRef.current);
      uploadIntervalRef.current = null;
    }
    setUploadProgress(100);

    setStatus(AppStatus.ANALYZING);
    setUploadMessage(null);

    const performUpload = async (base64?: string) => {
      let finalName = file.name;
      try {
        if (base64 && file.type.startsWith('image/')) {
          setUploadMessage("HALO is analyzing visual features...");
          finalName = await analyzeAndRenameImage(base64);
          setUploadMessage(`AI Renamed: ${finalName}`);
        }
      } catch {
        // AI rename not available
      }

      try {
        await uploadFile(targetId, file, finalName);
        await loadFolderContents(currentFolderId);
        onToast(`File uploaded to "${uploadTargetLabel}".`, 'success');
      } catch (err) {
        onToast(getErrorMessage(err), 'error');
      }
      setStatus(AppStatus.IDLE);
    };

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        performUpload(base64);
      };
      reader.readAsDataURL(file);
    } else {
      performUpload();
    }

    e.target.value = '';
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim()) return;

    if (scribeOutputId) {
      setStatus(AppStatus.SAVING);
      setScribeSaving(true);
      const finalizedMarkdown = noteContent;
      try {
        await finalizeScribeOutput(
          scribeOutputId,
          finalizedMarkdown,
          finalizedMarkdown.trim() !== scribeOriginalMarkdown.trim()
        );
        // Keep the finalized note visible so the doctor can explicitly "Save Note" to Drive
        // using the existing working save flow (no history workaround).
        clearScribeDraft();
        setNoteContent(finalizedMarkdown);
        setEditMode('preview');
        setPopulateMemoHasBeenCalled(true);
        setSelectedFinalizedNoteId(scribeOutputId);
        // IMPORTANT: clear scribeOutputId so the next "Save Note" click files to Drive
        // (instead of calling finalize again).
        setScribeOutputId(null);
        await loadFinalizedScribeNotes();
        setActiveTab('notes');
        onDataChange();
        onToast('Scribe note finalized. Click Save Note to file to Drive.', 'success');
      } catch (err) {
        onToast(getErrorMessage(err), 'error');
      } finally {
        setScribeSaving(false);
        setStatus(AppStatus.IDLE);
      }
      return;
    }

    // Enforce template selection before filing to Drive
    if (!activeTemplate) {
      openTemplateModal('save');
      return;
    }

    setStatus(AppStatus.FILING);
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const templateName = String(
        activeTemplate.name || activeTemplate.label || activeTemplate.id
      )
        .trim()
        .replace(/[\\/]+/g, ' ')
        .replace(/\s+/g, ' ');

      // Use template name as both the subfolder and file name prefix
      const folderPath = templateName;
      const fileName = `${templateName} - ${dateStr}`;

      await saveNote(patient.id, noteContent, {
        fileName,
        folderPath,
      });

      // Reset for next generation after successful Drive save
      setNoteContent('');
      clearScribeDraft();
      setEditMode('write');
      setPopulateMemoHasBeenCalled(false);
      setSelectedFinalizedNoteId(null);
      setSelectedTemplateId(null);
      await loadFolderContents(currentFolderId);
      onDataChange();
      onToast('Note saved to Drive. Select a template to generate another.', 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
    setStatus(AppStatus.IDLE);
  };

  const resolvedScribeTemplateId = activeTemplate ? resolveScribeTemplateId(activeTemplate) : null;
  const hasSelectedScribeTemplate = Boolean(
    activeTemplate &&
      (activeTemplate.id === SOAP_BUILTIN_TEMPLATE.id || resolvedScribeTemplateId)
  );

  const activeScribeRequirements = useMemo(() => {
    if (!resolvedScribeTemplateId) return [];
    const meta = scribeTemplates.find((s) => s.id === resolvedScribeTemplateId);
    const reqs = meta?.requirements ?? [];
    return reqs.filter((r) => r.required);
  }, [resolvedScribeTemplateId, scribeTemplates]);

  const selectedResolvedScribeId = useMemo(() => {
    if (!selectedTemplateId) return null;
    const selected = templates.find((t) => t.id === selectedTemplateId);
    if (selected) {
      return resolveScribeTemplateId(selected);
    }
    if (selectedTemplateId === SOAP_BUILTIN_TEMPLATE.id) {
      return (
        scribeTemplates.find((t) => t.is_streamable && t.name.toLowerCase().includes('soap'))?.id ?? null
      );
    }
    if (isPostgresUuid(selectedTemplateId)) {
      return selectedTemplateId;
    }
    return scribeTemplates.find((t) => t.firebase_template_id === selectedTemplateId)?.id ?? selectedTemplateId;
  }, [selectedTemplateId, scribeTemplates, templates]);

  const selectedModalScribeMeta = useMemo(() => {
    if (!selectedTemplateId) return null;
    const selected = templates.find((t) => t.id === selectedTemplateId);
    return selected ? findScribeMetaForTemplate(selected) : null;
  }, [selectedTemplateId, templates, scribeTemplates]);

  const activeScribeMeta = useMemo(() => {
    if (!activeTemplate) return null;
    return findScribeMetaForTemplate(activeTemplate);
  }, [activeTemplate, scribeTemplates]);

  const modalScribeRequirements = useMemo(() => {
    if (!selectedResolvedScribeId) return [];
    const meta = scribeTemplates.find((t) => t.id === selectedResolvedScribeId);
    return (meta?.requirements ?? []).filter((r) => r.required);
  }, [selectedResolvedScribeId, scribeTemplates]);

  /** Transcript for Scribe: plain editor text, or concatenated SOAP/structured fields when the editor is in structured mode. */
  const scribeInputText = useMemo(() => {
    const trimmed = noteContent.trim();
    if (!trimmed) return '';
    const structured = parseStructuredNote(
      noteContent,
      activeTemplate?.id
    );
    if (structured?.fields?.length) {
      const fromFields = structured.fields
        .map((f) => f.value.trim())
        .filter(Boolean)
        .join('\n\n')
        .trim();
      if (fromFields) return fromFields;
    }
    return trimmed;
  }, [noteContent, activeTemplate?.id]);

  const activeScribeIsStreamable = useMemo(() => {
    if (!activeTemplate) return false;
    if (scribeTemplatesLoading) return false;
    if (activeScribeMeta) return activeScribeMeta.is_streamable;
    return false;
  }, [activeTemplate, activeScribeMeta, scribeTemplatesLoading]);

  const canGenerateScribeNote = Boolean(
    patient?.id &&
      scribeInputText &&
      !scribeGenerating &&
      !scribeSaving &&
      hasSelectedScribeTemplate &&
      activeScribeIsStreamable
  );

  const streamScribeDraftFromTranscript = async (
    rawTranscript: string,
    template: TemplateItem,
    options?: { addendum?: string }
  ): Promise<void> => {
    const transcriptBase = rawTranscript.trim();
    if (!transcriptBase) {
      onToast('Add encounter text in the Clinical Note Editor before generating.', 'info');
      return;
    }

    const addendum = (options?.addendum ?? '').trim();
    const transcriptForApi = addendum ? `${transcriptBase}\n\n${addendum}` : transcriptBase;

    const templateIdForStreaming = resolveScribeTemplateId(template);
    if (!templateIdForStreaming) {
      onToast('No Scribe template is configured for this selection.', 'error');
      return;
    }

    const scribeMeta = findScribeMetaForTemplate(template);
    if (scribeMeta && !scribeMeta.is_streamable) {
      onToast(
        'This template is not streamable for Scribe. Activate a style prompt locally or choose another template.',
        'error'
      );
      return;
    }

    if (scribeGenerating || scribeSaving) {
      return;
    }

    setActiveTab('notes');
    setEditMode('write');
    setSelectedFinalizedNoteId(null);
    setScribeError(null);
    setScribeMissingGuidance(null);
    setScribeGenerating(true);
    setPopulateMemoHasBeenCalled(false);
    setScribeOutputId(null);
    setScribeOriginalMarkdown('');

    let streamedMarkdown = '';
    let resolvedOutputId = '';
    const consultationId = scribeConsultationIdRef.current ?? crypto.randomUUID();
    scribeConsultationIdRef.current = consultationId;

    try {
      console.log('[scribe-workspace] generate request prep', {
        hasPracticeId: Boolean(practiceId),
        practiceId,
      });
      const result = await generateScribeDraft(
        {
          ...(practiceId ? { practiceId } : {}),
          patientId: patient.id,
          consultationId,
          templateId: templateIdForStreaming,
          rawTranscript: transcriptForApi,
        },
        {
          onStreamStart: () => {
            setNoteContent('');
          },
          onChunk: (chunk) => {
            streamedMarkdown += chunk;
            setNoteContent((prev) => prev + chunk);
          },
          onOutputId: (outputId) => {
            console.log('[scribe-workspace] onOutputId fired', {
              hasOutputId: Boolean(outputId),
              outputId,
            });
            resolvedOutputId = outputId;
            setScribeOutputId(outputId);
          },
        }
      );

      const finalOutputId = resolvedOutputId || result.outputId || null;
      console.log('[scribe-workspace] generation completed', {
        resolvedOutputId,
        resultOutputId: result.outputId,
        finalOutputId,
      });
      if (finalOutputId) {
        setScribeOutputId(finalOutputId);
      }

      if (streamedMarkdown.trim() && finalOutputId) {
        setScribeOriginalMarkdown(streamedMarkdown);
        setPopulateMemoHasBeenCalled(true);
        setScribeError(null);
        setScribeMissingGuidance(null);
        setScribeRequirementAddendum('');
        onToast('Scribe draft ready. Review and save when finished.', 'success');
      } else if (streamedMarkdown.trim()) {
        setPopulateMemoHasBeenCalled(false);
        setScribeError('Scribe draft finished, but the draft id was not returned. Try generating again.');
        onToast('Scribe draft finished, but the draft id was not returned. Try generating again.', 'error');
      } else {
        onToast('Scribe draft completed with no content.', 'info');
      }
    } catch (err) {
      if (streamedMarkdown.trim()) {
        setNoteContent(streamedMarkdown);
      }
      if (
        err instanceof ApiError &&
        err.status === 422 &&
        err.details?.['status'] === 'missing_required_inputs'
      ) {
        const d = err.details;
        setScribeMissingGuidance({
          templateId: typeof d['templateId'] === 'string' ? d['templateId'] : '',
          missing: Array.isArray(d['missing'])
            ? (d['missing'] as Array<{ key: string; label: string; message: string }>)
            : [],
          detected:
            typeof d['detected'] === 'object' && d['detected'] !== null && !Array.isArray(d['detected'])
              ? (d['detected'] as Record<string, string>)
              : {},
        });
        onToast('Halo needs a bit more information before it can generate this template.', 'info');
      } else {
        const message = getErrorMessage(err);
        setScribeError(message);
        onToast(message, 'error');
      }
    } finally {
      setScribeGenerating(false);
    }
  };

  const handleGenerateScribeDraft = async () => {
    if (!activeTemplate) {
      openTemplateModal('save');
      return;
    }

    await streamScribeDraftFromTranscript(scribeInputText, activeTemplate, {
      addendum: scribeRequirementAddendum,
    });
  };

  const handleScribeResult = async (result: { rawTranscript: string; soapNote: string }) => {
    setActiveTab('notes');
    clearScribeDraft();

    const transcript = (result.rawTranscript || '').trim();
    const fallbackNote = (result.soapNote || '').trim();
    const transcriptForScribe = transcript || fallbackNote;

    if (!transcriptForScribe) {
      onToast('No transcript was captured. Please record again.', 'error');
      return;
    }

    if (!activeTemplate) {
      setNoteContent(transcriptForScribe);
      setEditMode('write');
      return;
    }

    try {
      const templateIdForStreaming = resolveScribeTemplateId(activeTemplate);
      if (!templateIdForStreaming && isSoapTemplate(activeTemplate)) {
        onToast('SOAP template is selected, but no streamable SOAP template is configured for this practice. Please select a different template or configure a SOAP template.', 'error');
        return;
      }

      await streamScribeDraftFromTranscript(transcriptForScribe, activeTemplate);
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
      setNoteContent(transcriptForScribe);
      setEditMode('write');
    }
  };

  const handlePopulateMemo = () => {
    if (!noteContent.trim()) {
      onToast('Type clinical text before generating.', 'info');
      return;
    }
    pendingPopulateMemoSourceRef.current = noteContent;
    void openTemplateModal('typed');
  };

  const scribeTemplatesToPickerItems = (items: ScribeTemplate[]): TemplateItem[] =>
    items
      .filter((t) => t.is_streamable)
      .map((t) => ({
        id: t.id,
        name: t.name,
        label: t.name,
        type: 'scribe',
      }));

  const openTemplateModal = async (mode: 'record' | 'save' | 'typed', pendingStart?: () => void) => {
    setTemplateModalMode(mode);
    setTemplateModalOpen(true);
    if (pendingStart) pendingRecordStartRef.current = pendingStart;

    if (mode === 'record' || mode === 'typed') {
      setSelectedTemplateId(null);
      selectedTemplateIdRef.current = null;
    }

    const applySelection = (mergedTemplates: TemplateItem[]) => {
      if (mode !== 'save') return;
      setSelectedTemplateId((prev) => {
        if (prev && mergedTemplates.some((t) => t.id === prev)) return prev;
        let savedId: string | null = null;
        try {
          savedId = localStorage.getItem(LAST_TEMPLATE_KEY);
        } catch {
          savedId = null;
        }
        if (savedId && mergedTemplates.some((t) => t.id === savedId)) {
          selectedTemplateIdRef.current = savedId;
          return savedId;
        }
        selectedTemplateIdRef.current = SOAP_BUILTIN_TEMPLATE.id;
        return SOAP_BUILTIN_TEMPLATE.id;
      });
    };

    setTemplates((prev) => (prev.length > 0 ? prev : []));
    setTemplatesLoading(true);
    setTemplatesError(null);

    try {
      const supabaseTemplates = scribeTemplates.length > 0 ? scribeTemplates : await getScribeTemplates();
      const scribePickerItems = scribeTemplatesToPickerItems(supabaseTemplates);

      if (scribePickerItems.length > 0) {
        setScribeTemplates(supabaseTemplates);
        setTemplates(scribePickerItems);
        setTemplatesError(null);
        applySelection(scribePickerItems);
        return;
      }

      const cachedTemplates = getCachedTemplates();
      if (cachedTemplates) {
        const deduped = cachedTemplates.filter((item) => item.id && item.id !== SOAP_BUILTIN_TEMPLATE.id);
        const mergedTemplates = [SOAP_BUILTIN_TEMPLATE, ...deduped];
        setTemplates(mergedTemplates);
        applySelection(mergedTemplates);
        return;
      }

      const state = await getTemplatesUiState();
      const deduped = state.templates.filter((item) => item.id && item.id !== SOAP_BUILTIN_TEMPLATE.id);
      const mergedTemplates = [SOAP_BUILTIN_TEMPLATE, ...deduped];
      setTemplates(mergedTemplates);
      if (state.status === 'needs-halo-setup' || state.status === 'upstream-failure' || state.status === 'error') {
        setTemplatesError(state.message || 'Could not load templates.');
      } else if (state.status === 'empty') {
        setTemplatesError(state.message || 'No templates found for your HALO account.');
      }
      applySelection(mergedTemplates);
    } catch (err) {
      setTemplates((prev) => (prev.length > 0 ? prev : [SOAP_BUILTIN_TEMPLATE]));
      if (mode === 'save') {
        setSelectedTemplateId((prev) => {
          const nextId = prev || SOAP_BUILTIN_TEMPLATE.id;
          selectedTemplateIdRef.current = nextId;
          return nextId;
        });
      }
      setTemplatesError(getErrorMessage(err));
    } finally {
      setTemplatesLoading(false);
    }
  };

  const generateFromTypedDraft = async (template: TemplateItem) => {
    const rawText = (pendingPopulateMemoSourceRef.current || noteContent).trim();
    if (!rawText) {
      onToast('Type clinical text before generating.', 'info');
      return;
    }

    clearScribeDraft();
    setGenerateNoteLoading(true);
    try {
      const result = await generateNote({
        template_id: template.id,
        text: rawText,
        return_type: 'note',
      });

      if (result.mode === 'note') {
        const generatedText =
          typeof result.note === 'string'
            ? result.note
            : JSON.stringify(result.note, null, 2);
        setNoteContent(generatedText);
      }

      setPopulateMemoHasBeenCalled(true);
      setEditMode('write');
      onToast('Draft generated. Review and save when ready.', 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    } finally {
      setGenerateNoteLoading(false);
      pendingPopulateMemoSourceRef.current = null;
    }
  };

  const handleConfirmTemplate = () => {
    const chosenId = selectedTemplateIdRef.current || selectedTemplateId;
    if (!chosenId) return;

    const tmpl = templates.find((t) => t.id === chosenId);
    if (!tmpl) return;

    try {
      localStorage.setItem(LAST_TEMPLATE_KEY, chosenId);
    } catch {
      // ignore storage issues
    }

    setActiveTemplate(tmpl);
    scribeConsultationIdRef.current = crypto.randomUUID();
    selectedTemplateIdRef.current = chosenId;
    const mode = templateModalMode;
    setTemplateModalOpen(false);

    if (mode === 'record' && pendingRecordStartRef.current) {
      const startFn = pendingRecordStartRef.current;
      pendingRecordStartRef.current = null;
      startFn();
      return;
    }

    if (mode === 'typed') {
      void generateFromTypedDraft(tmpl);
    }
  };

  const handleDiscardNote = () => {
    setNoteContent('');
    setActiveTemplate(null);
    setSelectedTemplateId(null);
    selectedTemplateIdRef.current = null;
    pendingPopulateMemoSourceRef.current = null;
    clearScribeDraft();
    setPopulateMemoHasBeenCalled(false);
    setSelectedFinalizedNoteId(null);
    setEditMode('write');
  };

  // Chat handler — uses streaming for progressive response display
  const handleSendChat = async () => {
    const question = chatInput.trim();
    if (!question || chatLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: question, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);
    setChatLongWait(false);

    if (chatLongWaitTimerRef.current) clearTimeout(chatLongWaitTimerRef.current);
    chatLongWaitTimerRef.current = setTimeout(() => setChatLongWait(true), 8000);

    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() };
    setChatMessages(prev => [...prev, assistantPlaceholder]);

    try {
      await askHaloStream(
        patient.id,
        question,
        chatMessagesRef.current,
        (chunk) => {
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
            }
            return prev;
          });
        }
      );
    } catch (err) {
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          return [...prev.slice(0, -1), {
            ...last,
            content: 'Sorry, I encountered an error. Please try again.',
          }];
        }
        return prev;
      });
      onToast(getErrorMessage(err), 'error');
    } finally {
      setChatLoading(false);
      setChatLongWait(false);
      if (chatLongWaitTimerRef.current) {
        clearTimeout(chatLongWaitTimerRef.current);
        chatLongWaitTimerRef.current = null;
      }
    }
  };

  // Create folder handler
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(currentFolderId, name);
      setShowCreateFolderModal(false);
      setNewFolderName("");
      await loadFolderContents(currentFolderId);
      onToast(`Folder "${name}" created.`, 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
  };

  const startEditPatient = () => {
    setEditName(patient.name);
    setEditDob(patient.dob);
    setEditSex(patient.sex || 'M');
    setEditingPatient(true);
  };

  const savePatientEdit = async () => {
    if (!editName.trim() || !editDob) return;
    try {
      await updatePatient(patient.id, { name: editName, dob: editDob, sex: editSex });
      setEditingPatient(false);
      onDataChange();
      onToast('Patient details updated.', 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
  };

  const startEditFile = (file: DriveFile) => {
    setEditingFile(file);
    setEditFileName(file.name);
  };

  const saveFileEdit = async () => {
    if (!editingFile || !editFileName.trim()) return;
    try {
      await updateFileMetadata(patient.id, editingFile.id, editFileName);

      const crumbIndex = breadcrumbs.findIndex(b => b.id === editingFile.id);
      if (crumbIndex >= 0) {
        setBreadcrumbs(prev => prev.map((b, i) => i === crumbIndex ? { ...b, name: editFileName } : b));
      }

      setEditingFile(null);
      await loadFolderContents(currentFolderId);
      onToast('Item renamed.', 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    try {
      await deleteFile(fileToDelete.id);
      setFileToDelete(null);
      await loadFolderContents(currentFolderId);
      onToast('File moved to trash.', 'success');
    } catch (err) {
      onToast(getErrorMessage(err), 'error');
    }
  };

  const hasAiContent = alerts.length > 0 || summary.length > 0;

  const closeChatSheet = () => setChatSheetOpen(false);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-white">
      {/* Header */}
      <div className="z-10 shrink-0 border-b border-slate-200/50 bg-white/95 backdrop-blur-md">
        <div className="flex items-center gap-2 px-3 py-2 md:px-8 md:py-3">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-teal-600 transition-colors hover:bg-teal-50 lg:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
            aria-label="Back to patient list"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
          {onOpenPatientsList && (
            <button
              type="button"
              onClick={onOpenPatientsList}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-teal-600 lg:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
              title="Patients"
              aria-label="Open patient list"
            >
              <Users className="h-4 w-4" />
            </button>
          )}

          <div className="group min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-[17px] font-semibold leading-snug text-slate-900 md:text-xl">{patient.name}</h1>
              <button
                type="button"
                onClick={startEditPatient}
                className="shrink-0 rounded-full p-1 text-slate-300 transition-all hover:bg-slate-100 hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 lg:opacity-0 lg:group-hover:opacity-100"
                title="Edit patient"
              >
                <Pencil size={13} />
              </button>
            </div>
            <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-400 md:text-xs">
              {patient.dob}<span className="mx-1 text-slate-300">·</span>{patient.sex || '—'}<span className="mx-1 text-slate-300">·</span>Last {patient.lastVisit}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {status === AppStatus.UPLOADING ? (
              <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-900/[0.04]">
                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-[width] duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold tabular-nums text-teal-700">{uploadProgress}%</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openUploadPicker}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-slate-900/[0.04] px-3 text-xs font-medium text-slate-600 transition-all hover:bg-teal-50 hover:text-teal-700 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                  title="Upload file"
                >
                  <Upload className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                />
              </>
            )}
          </div>
        </div>
        {uploadMessage && status !== AppStatus.UPLOADING && (
          <div className="flex items-center gap-1.5 border-t border-teal-100/50 bg-teal-50/40 px-4 py-1 md:px-8">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-teal-600" aria-hidden />
            <span className="truncate text-[11px] font-medium text-teal-700">{uploadMessage}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/50">
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 py-4 pb-bottom-nav md:px-8 md:py-8 lg:pb-8">
          {/* AI Panel */}
          {hasAiContent && showAiPanel && (
            <div className="mb-4 shrink-0 space-y-4 sm:mb-6">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Insights</span>
                <button
                  type="button"
                  onClick={() => setShowAiPanel(false)}
                  className="flex min-h-9 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={12} /> Hide
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SmartSummary
                  key={patient.id}
                  summary={summary}
                  loading={summaryLoading}
                  unavailable={summaryUnavailable}
                />
                {alerts.length > 0 && <div><LabAlerts alerts={alerts} /></div>}
              </div>
            </div>
          )}

          {hasAiContent && !showAiPanel && (
            <div className="mb-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowAiPanel(true)}
                className="flex h-8 items-center gap-1.5 rounded-full bg-slate-900/[0.04] px-3 text-xs font-medium text-slate-600 transition-all hover:bg-teal-50 hover:text-teal-700 active:scale-[0.97]"
              >
                Show HALO AI Insights
              </button>
            </div>
          )}

          {/* Desktop tabs (lg+) */}
          <div className="mb-4 hidden shrink-0 gap-6 overflow-x-auto border-b border-slate-200 lg:mb-6 lg:flex md:gap-8">
            <button type="button" onClick={() => { setChatSheetOpen(false); setActiveTab('overview'); }} className={`whitespace-nowrap border-b-2 pb-3 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'overview' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Active Workspace</button>
            <button type="button" onClick={() => { setChatSheetOpen(false); setActiveTab('notes'); }} className={`whitespace-nowrap border-b-2 pb-3 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'notes' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Editor &amp; Scribe</button>
            <button type="button" onClick={() => { setChatSheetOpen(false); setActiveTab('chat'); }} className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'chat' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <MessageCircle size={14} /> Ask HALO?
            </button>
            <button type="button" onClick={() => { setChatSheetOpen(false); setActiveTab('scoring'); }} className={`whitespace-nowrap border-b-2 pb-3 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === 'scoring' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Scoring</button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {activeTab === 'overview' ? (
              <div className="min-h-0 flex-1 overflow-y-auto pb-overview-scroll [-webkit-overflow-scrolling:touch]">
                <FileBrowser
                  files={files}
                  status={status}
                  breadcrumbs={breadcrumbs}
                  onNavigateToFolder={navigateToFolder}
                  onNavigateBack={navigateBack}
                  onNavigateToBreadcrumb={navigateToBreadcrumb}
                  onStartEditFile={startEditFile}
                  onDeleteFile={setFileToDelete}
                  onViewFile={setViewingFile}
                  onCreateFolder={() => setShowCreateFolderModal(true)}
                />
              </div>
            ) : activeTab === 'notes' ? (
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Scribe transcript</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Paste or dictate the encounter text in the editor below, then stream a live draft in place.
                      </p>
                    </div>
                    {scribeOutputId && (
                      <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                        Draft linked
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateScribeDraft}
                      disabled={!canGenerateScribeNote}
                      title={
                        activeTemplate && !activeScribeIsStreamable
                          ? 'Selected template is not streamable for Scribe.'
                          : undefined
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-medium text-teal-700 transition-all hover:bg-teal-50 disabled:opacity-50"
                    >
                      {scribeGenerating ? 'Generating...' : 'Generate Scribe Note'}
                    </button>
                    {scribeTemplatesError && (
                      <span className="text-xs font-medium text-red-700" role="alert">
                        {scribeTemplatesError}
                      </span>
                    )}
                    {activeTemplate && !scribeTemplatesLoading && activeScribeMeta && !activeScribeMeta.is_streamable && (
                      <span className="text-xs font-medium text-amber-700">
                        Template not streamable — activate a style prompt or choose another template.
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        clearScribeDraft();
                        setSelectedFinalizedNoteId(null);
                        setNoteContent('');
                        setEditMode('write');
                      }}
                      disabled={scribeGenerating || scribeSaving || !noteContent.trim()}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
                    >
                      Clear field
                    </button>
                    {scribeOutputId && (
                      <span className="text-xs font-medium text-slate-500">
                        Save will finalize the linked draft.
                      </span>
                    )}
                  </div>
                  {scribeMissingGuidance && (
                    <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-sm text-slate-800 shadow-sm">
                      <p className="font-semibold text-teal-900">
                        Halo needs a bit more information before it can generate this template.
                      </p>
                      {scribeMissingGuidance.missing.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                          {scribeMissingGuidance.missing.map((m) => (
                            <li key={m.key}>
                              <span className="font-medium">{m.label}</span>
                              {m.message ? <span className="text-slate-600"> — {m.message}</span> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                      {Object.keys(scribeMissingGuidance.detected).length > 0 && (
                        <div className="mt-2 text-xs text-slate-700">
                          <span className="font-medium text-slate-600">Already detected from dictation:</span>
                          <ul className="mt-1 list-disc pl-4">
                            {Object.entries(scribeMissingGuidance.detected).map(([k, v]) => (
                              <li key={k}>
                                <span className="font-mono text-[11px]">{k}</span>: {v}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <label className="mt-3 block text-xs font-medium text-slate-600" htmlFor="scribe-requirement-addendum">
                        Addendum (extra phrases — merged with your note text when you retry)
                      </label>
                      <textarea
                        id="scribe-requirement-addendum"
                        value={scribeRequirementAddendum}
                        onChange={(e) => setScribeRequirementAddendum(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none ring-teal-500/30 focus:border-teal-400 focus:ring-2"
                        placeholder='e.g. "Resume duty on 10 February 2026."'
                      />
                    </div>
                  )}

                  {activeScribeRequirements.length > 0 && !scribeMissingGuidance && (
                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                      <p className="font-semibold">For this template, mention:</p>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                        {activeScribeRequirements.map((r) => (
                          <li key={r.key}>
                            <span>{r.displayLabel}</span>
                            {r.examplePhrase ? (
                              <span className="text-amber-900/80"> — e.g. {r.examplePhrase}</span>
                            ) : null}
                            {r.doctorHint ? (
                              <span className="mt-0.5 block text-[10px] text-amber-900/85">{r.doctorHint}</span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {scribeError && <p className="mt-2 text-sm text-rose-600">{scribeError}</p>}

                  {(finalizedScribeNotesLoading || finalizedScribeNotes.length > 0) && (
                    <ScribeSavedNotesPanel
                      notes={finalizedScribeNotes}
                      loading={finalizedScribeNotesLoading}
                      selectedOutputId={selectedFinalizedNoteId}
                      defaultOpen={false}
                      onSelect={(note) => {
                        clearScribeDraft();
                        setSelectedFinalizedNoteId(note.outputId);
                        setNoteContent(note.finalMarkdown);
                        setEditMode('write');
                        setPopulateMemoHasBeenCalled(true);
                      }}
                    />
                  )}
                </div>

                {selectedFinalizedNoteId && noteContent.trim() && (
                  <p className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span className="font-semibold text-slate-800">Active editor</span> — finalized Scribe note
                    loaded from history. Use Edit or Preview below.
                  </p>
                )}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <NoteEditor
                    noteContent={noteContent}
                    onNoteContentChange={setNoteContent}
                    editMode={editMode}
                    onEditModeChange={setEditMode}
                    status={status}
                    onSave={handleSaveNote}
                    onDiscard={handleDiscardNote}
                    activeTemplateLabel={activeTemplate ? (activeTemplate.name || activeTemplate.label || activeTemplate.id) : undefined}
                    activeTemplateId={activeTemplate?.id}
                    onChangeTemplate={() => {
                      pendingPopulateMemoSourceRef.current = null;
                      void openTemplateModal('save');
                    }}
                    onPopulateMemo={enableLegacyPopulateMemo ? handlePopulateMemo : undefined}
                    populateMemoLoading={generateNoteLoading}
                    isGenerating={scribeGenerating}
                    canSaveNote={populateMemoHasBeenCalled && !scribeGenerating && !scribeSaving}
                  />
                </div>
              </div>
            ) : activeTab === 'chat' && isLg ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <PatientChat
                  patientName={patient.name}
                  chatMessages={chatMessages}
                  chatInput={chatInput}
                  onChatInputChange={setChatInput}
                  chatLoading={chatLoading}
                  chatLongWait={chatLongWait}
                  onSendChat={handleSendChat}
                />
              </div>
            ) : activeTab === 'scoring' ? (
              <div className="min-h-0 min-w-0 flex-1 overflow-auto custom-scrollbar [-webkit-overflow-scrolling:touch]">
                <ScoringModule onToast={onToast} />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto pb-overview-scroll [-webkit-overflow-scrolling:touch]">
                <FileBrowser
                  files={files}
                  status={status}
                  breadcrumbs={breadcrumbs}
                  onNavigateToFolder={navigateToFolder}
                  onNavigateBack={navigateBack}
                  onNavigateToBreadcrumb={navigateToBreadcrumb}
                  onStartEditFile={startEditFile}
                  onDeleteFile={setFileToDelete}
                  onViewFile={setViewingFile}
                  onCreateFolder={() => setShowCreateFolderModal(true)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile / tablet: 3- or 4-tab nav + separate Record control (unchanged) */}
      {!isLg && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
          <div className="pointer-events-auto flex w-full max-w-lg items-stretch gap-2">
            <nav className="min-w-0 flex-1" aria-label="Workspace sections">
              <div className="flex h-full w-full items-stretch gap-0.5 rounded-[1.35rem] border border-slate-200/70 bg-slate-900/[0.07] p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.14),0_1px_0_rgba(255,255,255,0.75)_inset] ring-1 ring-black/[0.06] backdrop-blur-2xl supports-[backdrop-filter]:bg-slate-100/45">
                <button
                  type="button"
                  onClick={() => { closeChatSheet(); setActiveTab('overview'); }}
                  className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.05rem] px-1 py-1 text-[10px] font-semibold tracking-tight transition-all duration-200 sm:text-[11px] ${activeTab === 'overview' && !chatSheetOpen ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25' : 'text-slate-600 hover:bg-white/55 hover:text-slate-900 active:scale-[0.97]'}`}
                >
                  <FolderOpen className={`h-[1.35rem] w-[1.35rem] shrink-0 sm:h-6 sm:w-6 ${activeTab === 'overview' && !chatSheetOpen ? 'opacity-100' : 'opacity-80'}`} strokeWidth={activeTab === 'overview' && !chatSheetOpen ? 2.25 : 2} aria-hidden />
                  <span className="truncate">Workspace</span>
                </button>
                <button
                  type="button"
                  onClick={() => { closeChatSheet(); setActiveTab('notes'); }}
                  className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.05rem] px-1 py-1 text-[10px] font-semibold tracking-tight transition-all duration-200 sm:text-[11px] ${activeTab === 'notes' && !chatSheetOpen ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25' : 'text-slate-600 hover:bg-white/55 hover:text-slate-900 active:scale-[0.97]'}`}
                >
                  <FileText className={`h-[1.35rem] w-[1.35rem] shrink-0 sm:h-6 sm:w-6 ${activeTab === 'notes' && !chatSheetOpen ? 'opacity-100' : 'opacity-80'}`} strokeWidth={activeTab === 'notes' && !chatSheetOpen ? 2.25 : 2} aria-hidden />
                  <span className="truncate">Notes</span>
                </button>
                {showScoringInBottomNav && (
                  <button
                    type="button"
                    onClick={() => { closeChatSheet(); setActiveTab('scoring'); }}
                    className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.05rem] px-1 py-1 text-[10px] font-semibold tracking-tight transition-all duration-200 sm:text-[11px] ${activeTab === 'scoring' && !chatSheetOpen ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25' : 'text-slate-600 hover:bg-white/55 hover:text-slate-900 active:scale-[0.97]'}`}
                  >
                    <ClipboardList className={`h-[1.35rem] w-[1.35rem] shrink-0 sm:h-6 sm:w-6 ${activeTab === 'scoring' && !chatSheetOpen ? 'opacity-100' : 'opacity-80'}`} strokeWidth={activeTab === 'scoring' && !chatSheetOpen ? 2.25 : 2} aria-hidden />
                    <span className="truncate">Scoring</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setChatSheetOpen(true)}
                  className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.05rem] px-1 py-1 text-[10px] font-semibold tracking-tight transition-all duration-200 sm:text-[11px] ${chatSheetOpen ? 'bg-slate-900 text-white shadow-md shadow-slate-900/25' : 'text-slate-600 hover:bg-white/55 hover:text-slate-900 active:scale-[0.97]'}`}
                >
                  <MessageCircle className={`h-[1.35rem] w-[1.35rem] shrink-0 sm:h-6 sm:w-6 ${chatSheetOpen ? 'opacity-100' : 'opacity-80'}`} strokeWidth={chatSheetOpen ? 2.25 : 2} aria-hidden />
                  <span className="truncate">Ask HALO</span>
                </button>
              </div>
            </nav>
            <UniversalScribe
              variant="recordDock"
              onTranscriptionComplete={handleScribeResult}
              onError={(msg: string) => onToast(msg, 'error')}
              customTemplate={customTemplate}
              onRequestStartRecording={(start) => {
                openTemplateModal('record', start);
              }}
            />
          </div>
        </div>
      )}

      {/* Ask HALO bottom sheet (compact screens) */}
      {chatSheetOpen && !isLg && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[45] bg-slate-900/40"
            aria-label="Close Ask HALO"
            onClick={closeChatSheet}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="halo-chat-sheet-title"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <h2 id="halo-chat-sheet-title" className="text-sm font-bold uppercase tracking-wide text-teal-800">Ask HALO</h2>
              <button
                type="button"
                onClick={closeChatSheet}
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 pt-0">
              <PatientChat
                patientName={patient.name}
                chatMessages={chatMessages}
                chatInput={chatInput}
                onChatInputChange={setChatInput}
                chatLoading={chatLoading}
                chatLongWait={chatLongWait}
                onSendChat={handleSendChat}
                hideHeader
                className="h-full min-h-0 rounded-none border-0 shadow-none"
              />
            </div>
          </div>
        </>
      )}

      {isLg && (
        <UniversalScribe
          variant="floating"
          onTranscriptionComplete={handleScribeResult}
          onError={(msg: string) => onToast(msg, 'error')}
          customTemplate={customTemplate}
          reserveBottomNav={false}
          onRequestStartRecording={(start) => {
            openTemplateModal('record', start);
          }}
        />
      )}

      {/* EDIT PATIENT MODAL */}
      {editingPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Edit Patient Details</h3>
              <button onClick={() => setEditingPatient(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Full Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Date of Birth</label>
                <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Sex</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setEditSex('M')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editSex === 'M' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>M</button>
                  <button onClick={() => setEditSex('F')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editSex === 'F' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>F</button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingPatient(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                <button onClick={savePatientEdit} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                Rename {isFolder(editingFile) ? 'Folder' : 'File'}
              </h3>
              <button onClick={() => setEditingFile(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Name</label>
                <input type="text" value={editFileName} onChange={e => setEditFileName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingFile(null)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                <button onClick={saveFileEdit} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE FILE CONFIRMATION MODAL */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 m-4 border-2 border-rose-100">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mb-3 text-rose-500">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Delete File?</h3>
              <p className="text-slate-500 mt-2 text-sm px-4">
                Move <span className="font-bold text-slate-700">{fileToDelete.name}</span> to trash?
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setFileToDelete(null)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
              <button onClick={confirmDeleteFile} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-rose-500/20 transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {status === AppStatus.ANALYZING && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-teal-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-teal-900 font-bold text-lg mt-6">HALO is analyzing...</p>
          <p className="text-slate-500 text-sm mt-1">Extracting clinical concepts &amp; tagging files</p>
        </div>
      )}

      {status === AppStatus.FILING && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-cyan-900 font-bold text-lg mt-6">HALO is filing the patient notes...</p>
          <p className="text-slate-500 text-sm mt-1">Saving to Patient Notes folder &amp; scheduling conversion</p>
        </div>
      )}

      {/* UPLOAD DESTINATION PICKER MODAL */}
      {showUploadPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Upload Destination</h3>
              <button onClick={() => setShowUploadPicker(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Uploading to:</label>
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 px-3 py-2 rounded-lg">
                <FolderOpen size={16} className="text-teal-600 shrink-0" />
                <span className="text-sm font-semibold text-teal-700 truncate">{uploadTargetLabel}</span>
              </div>
            </div>
            <div className="mb-4">
              {uploadPickerLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={20} className="text-teal-500 animate-spin" />
                </div>
              ) : uploadPickerFolders.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-100 rounded-lg p-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1">Or choose a subfolder:</p>
                  {uploadPickerFolders.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => selectUploadFolder(folder)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-700 transition-colors"
                    >
                      <FolderOpen size={15} className="text-teal-500 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                      <ChevronRight size={14} className="text-slate-300 ml-auto shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-3">No subfolders available</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowUploadPicker(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
              <button onClick={confirmUploadDestination} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition flex items-center justify-center gap-2">
                <Upload size={16} /> Choose File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILE VIEWER MODAL */}
      {viewingFile && (
        <FileViewer
          fileId={viewingFile.id}
          fileName={viewingFile.name}
          mimeType={viewingFile.mimeType}
          fileUrl={viewingFile.url}
          onClose={() => setViewingFile(null)}
        />
      )}

      {/* CREATE FOLDER MODAL */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">New Folder</h3>
              <button onClick={() => { setShowCreateFolderModal(false); setNewFolderName(""); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Creating folder in:</label>
                <p className="text-sm font-semibold text-teal-700 bg-teal-50 px-3 py-2 rounded-lg border border-teal-100">
                  {breadcrumbs.map(b => b.name).join(' / ')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
                  placeholder="e.g. Lab Results, Imaging..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowCreateFolderModal(false); setNewFolderName(""); }} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  <FolderPlus size={16} /> Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE SELECTION MODAL */}
      {templateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Select Note Template
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choose how HALO should structure this note.
                </p>
              </div>
              <button
                onClick={() => {
                  setTemplateModalOpen(false);
                  pendingRecordStartRef.current = null;
                  pendingPopulateMemoSourceRef.current = null;
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {templatesLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 px-1 py-2">
                  <Loader2 size={14} className="animate-spin text-teal-500" />
                  Fetching templates…
                </div>
              )}

              {templatesError && !templatesLoading && (
                <div className="px-1 space-y-1">
                  <p className="text-xs text-rose-600">{templatesError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      void openTemplateModal(templateModalMode);
                    }}
                    className="text-[11px] font-medium text-teal-700 hover:text-teal-800"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!templatesLoading &&
                templates.map((t) => {
                  const scribeMeta = findScribeMetaForTemplate(t);
                  const streamableKnown = Boolean(scribeMeta) || t.id === SOAP_BUILTIN_TEMPLATE.id;
                  const isStreamable = scribeMeta?.is_streamable ?? (t.id === SOAP_BUILTIN_TEMPLATE.id);
                  return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      selectedTemplateIdRef.current = t.id;
                      setSelectedTemplateId(t.id);
                    }}
                    className={`w-full flex flex-col items-start px-3 py-2 rounded-lg border text-sm transition-all ${
                      selectedTemplateId === t.id
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="font-medium flex flex-wrap items-center gap-2">
                      <span>{t.name || t.label || t.id}</span>
                      {streamableKnown && !isStreamable && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            selectedTemplateId === t.id
                              ? 'bg-amber-400/20 text-amber-100'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          Not streamable
                        </span>
                      )}
                    </span>
                    {Boolean(t.description) && (
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        {String(t.description)}
                      </span>
                    )}
                  </button>
                  );
                })}
            </div>

            {selectedModalScribeMeta && !selectedModalScribeMeta.is_streamable && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                This template is not streamable for Scribe until a single active style prompt is configured.
              </div>
            )}

            {modalScribeRequirements.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                <p className="font-semibold">For this template, mention:</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  {modalScribeRequirements.map((r) => (
                    <li key={r.key}>
                      <span>{r.displayLabel}</span>
                      {r.examplePhrase ? (
                        <span className="text-amber-900/80"> — e.g. {r.examplePhrase}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setTemplateModalOpen(false);
                  pendingRecordStartRef.current = null;
                  pendingPopulateMemoSourceRef.current = null;
                }}
                className="flex-1 px-4 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTemplate}
                disabled={!selectedTemplateId}
                className={`flex-1 px-4 py-2 rounded-xl font-bold text-white shadow-lg shadow-teal-600/20 transition flex items-center justify-center gap-2 ${
                  templateModalMode === 'record'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-teal-600 hover:bg-teal-700'
                } disabled:opacity-50`}
              >
                {templateModalMode === 'record'
                  ? 'Continue Recording'
                  : templateModalMode === 'typed'
                    ? (enableLegacyPopulateMemo ? 'Populate Memo' : 'Continue')
                  : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
