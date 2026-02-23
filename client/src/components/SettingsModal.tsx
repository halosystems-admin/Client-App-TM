import React, { useState, useEffect, useRef } from 'react';
import type { UserSettings, TemplateItem } from '../../../shared/types';
import {
  X, Pencil, Save, User, Clock, Briefcase, MapPin, GraduationCap,
  FileText, Upload, Check, AlertCircle, RefreshCw, Loader2,
} from 'lucide-react';
import { runSchedulerNow, getTemplates } from '../services/api';

const LAST_TEMPLATE_KEY = 'halo_lastTemplateId';

const DEFAULT_SETTINGS: UserSettings = {
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
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings | null;
  onSave: (settings: UserSettings) => Promise<void>;
  userEmail?: string;
  userId?: string;
  notesApiAvailable?: boolean;
  loginTime: number;
}

type TemplateSource = 'soap' | 'custom' | 'practice';

export const SettingsModal: React.FC<Props> = ({
  isOpen, onClose, settings, onSave, userEmail, userId, notesApiAvailable, loginTime,
}) => {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<UserSettings>(settings || DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const [templateTab, setTemplateTab] = useState<TemplateSource>(
    (settings?.noteTemplate === 'custom' ? 'custom' : 'soap') as TemplateSource
  );
  const [uploadError, setUploadError] = useState('');
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // From practice: templates from FastAPI
  const [practiceTemplates, setPracticeTemplates] = useState<TemplateItem[]>([]);
  const [practiceTemplatesLoading, setPracticeTemplatesLoading] = useState(false);
  const [selectedPracticeTemplateId, setSelectedPracticeTemplateId] = useState<string | null>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_TEMPLATE_KEY) : null
  );

  useEffect(() => {
    if (settings) {
      setForm(settings);
      setTemplateTab((settings.noteTemplate === 'custom' ? 'custom' : 'soap') as TemplateSource);
    }
  }, [settings]);

  // Fetch practice templates when modal opens and Notes API is available
  useEffect(() => {
    if (!isOpen || !notesApiAvailable || !userId) return;
    setPracticeTemplatesLoading(true);
    getTemplates(userId)
      .then((list) => {
        setPracticeTemplates(list);
        if (list.length === 1) {
          setSelectedPracticeTemplateId(list[0].id);
          localStorage.setItem(LAST_TEMPLATE_KEY, list[0].id);
        } else if (list.length > 1) {
          const last = localStorage.getItem(LAST_TEMPLATE_KEY);
          const found = list.some((t) => t.id === last);
          if (found && last) {
            setSelectedPracticeTemplateId(last);
          } else {
            setSelectedPracticeTemplateId(list[0].id);
            localStorage.setItem(LAST_TEMPLATE_KEY, list[0].id);
          }
        }
      })
      .catch(() => setPracticeTemplates([]))
      .finally(() => setPracticeTemplatesLoading(false));
  }, [isOpen, notesApiAvailable, userId]);

  // Session timer
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const diff = Date.now() - loginTime;
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isOpen, loginTime]);

  const requiredFieldsMissing = !form.firstName.trim() || !form.lastName.trim() || !form.profession.trim() || !form.department.trim();

  const handleSave = async () => {
    if (editMode && requiredFieldsMissing) return;
    setSaving(true);
    try {
      const noteTemplate: 'soap' | 'custom' = templateTab === 'custom' ? 'custom' : 'soap';
      const updated: UserSettings = { ...form, noteTemplate };
      await onSave(updated);
      setForm(updated);
      setEditMode(false);
    } catch {
      // Error handled by parent
    }
    setSaving(false);
  };

  const handleSelectPracticeTemplate = (templateId: string) => {
    setSelectedPracticeTemplateId(templateId);
    localStorage.setItem(LAST_TEMPLATE_KEY, templateId);
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');

    // Accept .txt, .md, and .docx (read as text)
    const validTypes = ['text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExts = ['.txt', '.md'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setUploadError('Please upload a .txt or .md file. These formats work best for AI template reading.');
      return;
    }

    if (file.size > 50000) {
      setUploadError('Template file too large. Keep it under 50KB.');
      return;
    }

    try {
      const text = await file.text();
      setForm(prev => ({
        ...prev,
        customTemplateContent: text,
        customTemplateName: file.name,
        noteTemplate: 'custom',
      }));
      setTemplateTab('custom');
    } catch {
      setUploadError('Failed to read file.');
    }
    e.target.value = '';
  };

  const handleRunScheduler = async () => {
    setSchedulerMessage(null);
    setSchedulerRunning(true);
    try {
      const res = await runSchedulerNow();
      setSchedulerMessage(res.message || 'Done.');
    } catch {
      setSchedulerMessage('Request failed. Make sure you’re signed in.');
    }
    setSchedulerRunning(false);
  };

  if (!isOpen) return null;

  const hasProfile = form.firstName || form.lastName || form.profession || form.department;
  const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ') || 'Not set';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg m-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-500/20 rounded-xl flex items-center justify-center">
              <User size={20} className="text-teal-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Profile & Settings</h2>
              <p className="text-slate-400 text-xs">{userEmail || 'Not signed in'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="p-2 rounded-lg text-slate-400 hover:text-teal-400 hover:bg-slate-700 transition-all"
                title="Edit Profile"
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Session Info */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <Clock size={16} className="text-teal-600 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Session Duration</p>
              <p className="text-sm font-mono font-bold text-slate-700">{elapsed}</p>
            </div>
          </div>

          {/* Profile Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <User size={12} /> Practitioner Profile
            </h3>

            {editMode ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">First Name <span className="text-rose-400">*</span></label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="e.g. Sarah"
                      className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition ${!form.firstName.trim() ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Last Name <span className="text-rose-400">*</span></label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="e.g. Connor"
                      className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition ${!form.lastName.trim() ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Briefcase size={11} /> Profession <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    value={form.profession}
                    onChange={e => setForm(prev => ({ ...prev, profession: e.target.value }))}
                    placeholder="e.g. Physiotherapist, General Practitioner"
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition ${!form.profession.trim() ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Briefcase size={11} /> Department <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={e => setForm(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="e.g. Orthopaedics, Cardiology, General Practice"
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition ${!form.department.trim() ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><MapPin size={11} /> City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="e.g. Cape Town"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Postal Code</label>
                    <input
                      type="text"
                      value={form.postalCode}
                      onChange={e => setForm(prev => ({ ...prev, postalCode: e.target.value }))}
                      placeholder="e.g. 8001"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><GraduationCap size={11} /> University</label>
                  <input
                    type="text"
                    value={form.university}
                    onChange={e => setForm(prev => ({ ...prev, university: e.target.value }))}
                    placeholder="e.g. University of Cape Town"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition"
                  />
                </div>
                {requiredFieldsMissing && (
                  <p className="text-xs text-rose-400 flex items-center gap-1 pt-1"><AlertCircle size={12} /> Please fill in all required fields marked with *</p>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                {hasProfile ? (
                  <div className="divide-y divide-slate-100">
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 bg-teal-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {(form.firstName?.[0] || '').toUpperCase()}{(form.lastName?.[0] || '').toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{displayName}</p>
                        {form.profession && <p className="text-xs text-teal-600 font-medium">{form.profession}</p>}
                        {form.department && <p className="text-xs text-slate-500">{form.department}</p>}
                      </div>
                    </div>
                    {(form.city || form.postalCode) && (
                      <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-slate-500">
                        <MapPin size={12} className="text-slate-400" />
                        {[form.city, form.postalCode].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {form.university && (
                      <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-slate-500">
                        <GraduationCap size={12} className="text-slate-400" />
                        {form.university}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-slate-400">No profile information set</p>
                    <button
                      onClick={() => setEditMode(true)}
                      className="mt-2 text-xs font-semibold text-teal-600 hover:text-teal-700"
                    >
                      Set up your profile
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Template Section */}
          <div className="border-t border-slate-100 pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <FileText size={12} /> Documentation Template
            </h3>
            <p className="text-xs text-slate-400 mb-3">Choose how HALO generates clinical notes from scribe dictation.</p>

            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 flex-wrap gap-1">
              <button
                onClick={() => { setTemplateTab('soap'); setForm(prev => ({ ...prev, noteTemplate: 'soap' })); }}
                className={`flex-1 min-w-0 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  templateTab === 'soap' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {templateTab === 'soap' && <Check size={12} />} SOAP Note
              </button>
              <button
                onClick={() => setTemplateTab('custom')}
                className={`flex-1 min-w-0 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  templateTab === 'custom' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {templateTab === 'custom' && <Check size={12} />} Custom Template
              </button>
              {notesApiAvailable && (
                <button
                  onClick={() => setTemplateTab('practice')}
                  className={`flex-1 min-w-0 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    templateTab === 'practice' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {templateTab === 'practice' && <Check size={12} />} From practice
                </button>
              )}
            </div>

            {templateTab === 'practice' && (
              <div className="mb-4">
                {practiceTemplatesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                    <Loader2 size={16} className="animate-spin" /> Loading templates…
                  </div>
                ) : practiceTemplates.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">No templates from your practice. Configure NOTES_API_URL on the server.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {practiceTemplates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectPracticeTemplate(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          selectedPracticeTemplateId === t.id
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {t.name ?? t.label ?? t.id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {templateTab === 'soap' ? (
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-teal-800 mb-1">SOAP Note Format</p>
                <p className="text-xs text-teal-600 leading-relaxed">
                  Notes will be structured as: <strong>Subjective</strong>, <strong>Objective</strong>, <strong>Assessment</strong>, <strong>Plan</strong> -- 
                  the standard clinical documentation method.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {form.customTemplateContent ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-teal-600" />
                        <p className="text-sm font-semibold text-slate-700">{form.customTemplateName}</p>
                      </div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-medium text-teal-600 hover:text-teal-700"
                      >
                        Replace
                      </button>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg p-3 max-h-32 overflow-y-auto">
                      <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">{form.customTemplateContent.substring(0, 500)}{form.customTemplateContent.length > 500 ? '...' : ''}</pre>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-slate-200 hover:border-teal-300 rounded-xl p-6 text-center transition-colors group"
                  >
                    <Upload size={24} className="mx-auto text-slate-300 group-hover:text-teal-400 mb-2 transition-colors" />
                    <p className="text-sm font-semibold text-slate-500 group-hover:text-teal-600 transition-colors">Upload Template</p>
                    <p className="text-xs text-slate-400 mt-1">.txt or .md files recommended</p>
                  </button>
                )}

                {uploadError && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <AlertCircle size={14} />
                    {uploadError}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md"
                  onChange={handleTemplateUpload}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Run conversions now */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Note conversions</p>
            <p className="text-xs text-slate-500 mb-2">Run the scheduler now to convert any notes that are past the 10h (→ .docx) or 24h (→ .pdf) mark.</p>
            <button
              type="button"
              onClick={handleRunScheduler}
              disabled={schedulerRunning}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 text-sm font-medium transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={schedulerRunning ? 'animate-spin' : ''} />
              {schedulerRunning ? 'Running...' : 'Run conversions now'}
            </button>
            {schedulerMessage && (
              <p className="text-xs text-slate-600 mt-2">{schedulerMessage}</p>
            )}
          </div>
        </div>

        {/* Footer with Save */}
        {editMode || ((templateTab === 'soap' || templateTab === 'custom') && templateTab !== (settings?.noteTemplate || 'soap')) || form.customTemplateContent !== (settings?.customTemplateContent || '') ? (
          <div className="border-t border-slate-100 p-4 bg-slate-50 flex gap-3">
            <button
              onClick={() => {
                setEditMode(false);
                setForm(settings || DEFAULT_SETTINGS);
                setTemplateTab(settings?.noteTemplate || 'soap');
              }}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (editMode && requiredFieldsMissing)}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
