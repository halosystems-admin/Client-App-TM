import React, { useState, useEffect, useRef } from 'react';
import type { UserSettings } from '../../../shared/types';
import {
  X, Save, User, Clock, Briefcase,
  FileText, Upload, Check, AlertCircle, RefreshCw, Loader2,
  Settings as SettingsIcon, BarChart3, Droplets, Activity, Brain,
  Smartphone,
  ChevronRight,
  LayoutPanelTop,
} from 'lucide-react';
import { runSchedulerNow } from '../services/api';
import { CustomTemplates } from './settings/CustomTemplates';
import { TemplatePlayground } from './settings/TemplatePlayground';
import { scoringConfig } from '../features/scoring/scoringConfig';
import type { ScoringSystem } from '../features/scoring/scoringTypes';
import { CalculatorView } from '../features/scoring/CalculatorView';

const DEFAULT_SETTINGS: UserSettings = {
  firstName: '', lastName: '', profession: '', department: '',
  city: '', postalCode: '', university: '', noteTemplate: 'soap',
  customTemplateContent: '', customTemplateName: '',
  modules: { admissions: false },
  showScoringInBottomNav: true,
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings | null;
  onSave: (settings: UserSettings) => Promise<void>;
  userEmail?: string;
  googleUserId?: string;
  notesUserId?: string;
  notesApiAvailable?: boolean;
  loginTime: number;
  initialTab?: SettingsModalTab;
  openProfileInEditMode?: boolean;
}

export type SettingsModalTab = 'profile' | 'templates' | 'tools' | 'automations' | 'usage';
type TabType = SettingsModalTab;
type TemplateTabType = 'soap' | 'custom' | 'practice';

/* ── Reusable sub-components ── */

const InputField = ({ label, value, onChange, placeholder, type = 'text', inputMode }: any) => (
  <div className="space-y-1">
    <label className="block text-[13px] font-medium text-[#3c3c43]/60">{label}</label>
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full min-h-[44px] px-4 py-2.5 text-[15px] rounded-xl bg-white text-[#1c1c1e] outline-none border border-[#d1d1d6] focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all placeholder:text-[#c7c7cc]"
    />
  </div>
);

const IOSToggle = ({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? 'bg-[#34c759]' : 'bg-[#e9e9eb]'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-in-out ${
        checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
      }`}
    />
  </button>
);

const SectionLabel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[13px] font-normal text-[#3c3c43]/60 uppercase tracking-wide px-4 mb-[6px] ${className}`}>
    {children}
  </p>
);

function getCategoryTheme(category: string): { icon: React.ElementType; bg: string; text: string } {
  const c = category.toLowerCase();
  if (c.includes('cardio') || c.includes('pulmon'))
    return { icon: Activity, bg: 'bg-rose-50', text: 'text-rose-600' };
  if (c.includes('neuro') || c.includes('psych'))
    return { icon: Brain, bg: 'bg-purple-50', text: 'text-purple-600' };
  if (c.includes('hepato') || c.includes('gastro') || c.includes('liver'))
    return { icon: Briefcase, bg: 'bg-amber-50', text: 'text-amber-600' };
  if (c.includes('infect') || c.includes('critical') || c.includes('icu'))
    return { icon: AlertCircle, bg: 'bg-orange-50', text: 'text-orange-600' };
  return { icon: Activity, bg: 'bg-slate-100', text: 'text-slate-600' };
}

/* ── Main component ── */

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  userEmail,
  googleUserId,
  notesUserId,
  notesApiAvailable,
  loginTime,
  initialTab,
  openProfileInEditMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<UserSettings>(settings || DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState('');
  const [templateTab, setTemplateTab] = useState<TemplateTabType>(
    (settings?.noteTemplate === 'custom' ? 'custom' : 'soap'),
  );

  const [uploadError, setUploadError] = useState('');
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bmiWeight, setBmiWeight] = useState<string>('');
  const [bmiHeight, setBmiHeight] = useState<string>('');

  const [egfrAge, setEgfrAge] = useState<string>('');
  const [egfrSex, setEgfrSex] = useState<'M' | 'F'>('M');
  const [egfrCr, setEgfrCr] = useState<string>('');

  const [wellsCriteria, setWellsCriteria] = useState({
    cancer: false, paralysis: false, bedridden: false, tenderness: false,
    swollenLeg: false, calfSwelling: false, pittingEdema: false,
    collateralVeins: false, prevDVT: false, altDiagnosis: false,
  });

  const [gcsEye, setGcsEye] = useState<number>(4);
  const [gcsVerbal, setGcsVerbal] = useState<number>(5);
  const [gcsMotor, setGcsMotor] = useState<number>(6);

  const [activeScoringId, setActiveScoringId] = useState<string | null>(null);
  const [savingBottomNavPref, setSavingBottomNavPref] = useState(false);
  const [showHaloIdentityAdvanced, setShowHaloIdentityAdvanced] = useState(false);

  /* ── Calculations ── */
  const calculateBMI = () => {
    const w = parseFloat(bmiWeight);
    const h = parseFloat(bmiHeight) / 100;
    if (w > 0 && h > 0) return (w / (h * h)).toFixed(1);
    return null;
  };
  const bmiResult = calculateBMI();

  const egfrResult = (() => {
    const a = parseFloat(egfrAge);
    const cr = parseFloat(egfrCr);
    if (a > 0 && cr > 0) {
      let egfr = 175 * Math.pow(cr, -1.154) * Math.pow(a, -0.203);
      if (egfrSex === 'F') egfr *= 0.742;
      return Math.round(egfr);
    }
    return null;
  })();

  const wellsResult = (() => {
    let score = 0;
    const { altDiagnosis, ...plusOneCriteria } = wellsCriteria;
    Object.values(plusOneCriteria).forEach(val => { if (val) score += 1; });
    if (altDiagnosis) score -= 2;
    return score;
  })();

  const gcsResult = gcsEye + gcsVerbal + gcsMotor;

  const activeScoringSystem: ScoringSystem | null =
    activeScoringId ? (scoringConfig.systems.find((s) => s.id === activeScoringId) ?? null) : null;

  const dept = (form.department || '').toLowerCase();
  const showNephro = dept.includes('nephrology');
  const showSurgery = dept.includes('surgery') || dept.includes('internal medicine') || dept.includes('im');
  const showEmergency = dept.includes('emergency') || dept.includes('general') || dept.includes('er');
  const showSuggested = !showNephro && !showSurgery && !showEmergency;

  /* ── Handlers ── */
  const handleRunScheduler = async () => {
    setSchedulerMessage(null);
    setSchedulerRunning(true);
    try {
      const res = await runSchedulerNow();
      setSchedulerMessage(res.message || 'Done.');
    } catch {
      setSchedulerMessage('Request failed. Make sure you\u2019re signed in.');
    }
    setSchedulerRunning(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const sanitizedHaloUserId = (form.haloUserId || '').trim();
      const updated: UserSettings = {
        ...form,
        haloUserId: sanitizedHaloUserId || undefined,
        noteTemplate: templateTab === 'custom' ? 'custom' : 'soap',
      };
      await onSave(updated);
      setEditMode(false);
    } catch (e) {
      console.error('Save error:', e);
    }
    setSaving(false);
  };

  const handleShowScoringInBottomNavChange = async (enabled: boolean) => {
    const updated: UserSettings = {
      ...form,
      showScoringInBottomNav: enabled,
      noteTemplate: templateTab === 'custom' ? 'custom' : 'soap',
    };
    const prev = form.showScoringInBottomNav;
    setForm(updated);
    setSavingBottomNavPref(true);
    try {
      await onSave(updated);
    } catch {
      setForm((f) => ({ ...f, showScoringInBottomNav: prev }));
    } finally {
      setSavingBottomNavPref(false);
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
  };

  /* ── Effects ── */
  useEffect(() => {
    if (settings) {
      setForm({ ...DEFAULT_SETTINGS, ...settings });
      setTemplateTab((settings.noteTemplate === 'custom' ? 'custom' : 'soap'));
    }
  }, [settings]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialTab) {
      setActiveTab(initialTab);
      setEditMode(initialTab === 'profile' && openProfileInEditMode);
    } else {
      setActiveTab('profile');
      setEditMode(false);
    }
  }, [isOpen, initialTab, openProfileInEditMode]);

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

  if (!isOpen) return null;

  const requiredFieldsMissing = !form.firstName.trim() || !form.lastName.trim() || !form.profession.trim() || !form.department.trim();
  const persistedSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const hasUnsavedHaloUserIdChanges = (form.haloUserId || '').trim() !== ((persistedSettings.haloUserId || '').trim());
  const hasUnsavedTemplateChanges = templateTab !== 'practice' && templateTab !== (persistedSettings.noteTemplate || 'soap');
  const hasUnsavedModuleChanges = (form.modules?.admissions ?? false) !== (persistedSettings.modules?.admissions ?? false);
  const showSaveFooter = editMode || hasUnsavedTemplateChanges || hasUnsavedModuleChanges || hasUnsavedHaloUserIdChanges;

  const tabItems: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'tools', label: 'Clinical Tools', icon: Activity },
    { id: 'automations', label: 'Automations', icon: SettingsIcon },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
  ];

  const scoringByCategory = Object.entries(
    scoringConfig.systems.reduce<Record<string, ScoringSystem[]>>((acc, system) => {
      acc[system.category] = acc[system.category] || [];
      acc[system.category].push(system);
      return acc;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));

  /* ── Render ── */
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm font-sans">
      <div className="relative bg-[#f2f2f7] w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col sm:flex-row overflow-hidden">

        {/* ═══ DESKTOP SIDEBAR ═══ */}
        <div className="hidden sm:flex w-56 shrink-0 bg-[#f2f2f7] border-r border-black/[0.06] p-5 flex-col">
          <div className="mb-6 px-1">
            <h2 className="text-[17px] font-bold text-[#1c1c1e] tracking-tight">Settings</h2>
            <p className="text-[11px] text-[#8e8e93] font-semibold uppercase tracking-widest mt-0.5">Preferences</p>
          </div>

          <nav className="space-y-1 flex-1">
            {tabItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex min-h-[44px] items-center gap-3 px-3 py-2 rounded-xl text-left text-[15px] transition-all duration-200 ${
                  activeTab === id
                    ? 'bg-white text-teal-600 font-semibold shadow-sm'
                    : 'text-[#3c3c43] hover:bg-white/60 font-medium'
                }`}
              >
                <Icon size={18} className={activeTab === id ? 'text-teal-600' : 'text-[#8e8e93]'} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-[#8e8e93]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e8e93]">Session</span>
            </div>
            <p className="text-[13px] font-mono font-semibold text-[#1c1c1e]">{elapsed}</p>
          </div>
        </div>

        {/* ═══ MOBILE HEADER (sticky) ═══ */}
        <div className="sm:hidden bg-[#f2f2f7]/80 backdrop-blur-xl border-b border-black/[0.06] shrink-0 z-10">
          <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
            <h2 className="text-[17px] font-bold text-[#1c1c1e]">Settings</h2>
            <button
              onClick={onClose}
              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#e9e9eb] text-[#3c3c43] active:bg-[#d1d1d6] transition-colors"
            >
              <X size={14} strokeWidth={3} />
            </button>
          </div>
          <div className="flex gap-1.5 px-3 pb-2.5 overflow-x-auto no-scrollbar [-webkit-overflow-scrolling:touch]">
            {tabItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`shrink-0 flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 ${
                  activeTab === id
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-white/80 text-[#3c3c43] active:bg-white'
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ═══ CONTENT AREA ═══ */}
        <div className="flex-1 flex flex-col relative min-w-0 min-h-0 overflow-hidden">
          {/* Desktop close */}
          <button
            onClick={onClose}
            className="hidden sm:inline-flex absolute top-4 right-4 h-[30px] w-[30px] items-center justify-center rounded-full bg-[#e9e9eb] text-[#3c3c43] hover:bg-[#d1d1d6] transition-colors z-10"
          >
            <X size={14} strokeWidth={3} />
          </button>

          <div className="flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] custom-scrollbar overscroll-contain">
            <div className="p-4 sm:p-6 pb-36 max-w-2xl mx-auto w-full">

              {/* ════════ PROFILE TAB ════════ */}
              {activeTab === 'profile' && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  {!editMode ? (
                    <>
                      <SectionLabel className="mt-1">Practitioner Profile</SectionLabel>
                      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04]">
                        <div className="flex items-center gap-3.5 px-4 py-4">
                          <div className="w-[56px] h-[56px] bg-gradient-to-br from-teal-500 to-teal-700 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm">
                            {form.firstName?.[0] || ''}{form.lastName?.[0] || ''}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[17px] font-semibold text-[#1c1c1e] truncate">
                              {form.firstName || 'New'} {form.lastName || 'Practitioner'}
                            </h3>
                            <p className="text-[13px] text-[#8e8e93] truncate">
                              {form.profession || 'Profession not set'}
                            </p>
                          </div>
                          <button
                            onClick={() => setEditMode(true)}
                            className="text-teal-600 text-[15px] font-medium shrink-0 min-h-[44px] px-2"
                          >
                            Edit
                          </button>
                        </div>

                        <div className="divide-y divide-[#c6c6c8]/30">
                          <div className="flex items-center justify-between px-4 min-h-[44px] py-2.5">
                            <span className="text-[15px] text-[#1c1c1e]">Department</span>
                            <span className="text-[15px] text-[#8e8e93] truncate ml-4 text-right">{form.department || 'Not set'}</span>
                          </div>
                          {form.university && (
                            <div className="flex items-center justify-between px-4 min-h-[44px] py-2.5">
                              <span className="text-[15px] text-[#1c1c1e]">Institution</span>
                              <span className="text-[15px] text-[#8e8e93] truncate ml-4 text-right">{form.university}</span>
                            </div>
                          )}
                          {(form.city || form.postalCode) && (
                            <div className="flex items-center justify-between px-4 min-h-[44px] py-2.5">
                              <span className="text-[15px] text-[#1c1c1e]">Location</span>
                              <span className="text-[15px] text-[#8e8e93]">
                                {form.city}{form.city && form.postalCode ? ', ' : ''}{form.postalCode}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {(googleUserId || notesUserId || userEmail) && (
                        <>
                          <SectionLabel className="mt-7">Account</SectionLabel>
                          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04]">
                            <div className="flex items-center justify-between px-4 min-h-[44px] py-2.5">
                              <span className="text-[15px] text-[#1c1c1e]">HALO Notes User ID</span>
                              <span className="text-[13px] text-[#8e8e93]">
                                {(form.haloUserId || notesUserId || '').trim() ? 'Configured' : 'Not configured'}
                              </span>
                            </div>
                            <div className="px-4 pb-3">
                              <button
                                type="button"
                                onClick={() => setShowHaloIdentityAdvanced((prev) => !prev)}
                                className="text-[13px] font-medium text-teal-700 hover:text-teal-800"
                              >
                                {showHaloIdentityAdvanced ? 'Hide Advanced Settings' : 'Advanced Settings'}
                              </button>
                            </div>
                            {showHaloIdentityAdvanced && (
                              <div className="px-4 pb-4 space-y-2 border-t border-[#c6c6c8]/30">
                                <label className="block pt-3 text-[13px] font-medium text-[#3c3c43]/60">HALO Notes User ID (Company-managed)</label>
                                <input
                                  type="text"
                                  value={form.haloUserId || ''}
                                  onChange={(e) => setForm({ ...form, haloUserId: e.target.value })}
                                  placeholder="Enter company-provisioned HALO user ID"
                                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white text-[#1c1c1e] outline-none border border-[#d1d1d6] focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all placeholder:text-[#c7c7cc] font-mono text-[13px]"
                                />
                                <p className="text-[12px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                  Company-provisioned identifier. Do not change unless instructed by your organization.
                                </p>
                              </div>
                            )}
                            {userEmail && (
                              <div className="flex items-center justify-between px-4 min-h-[44px] py-2.5 border-t border-[#c6c6c8]/30">
                                <span className="text-[15px] text-[#1c1c1e]">Signed-in Email</span>
                                <span className="text-[13px] text-[#8e8e93] truncate ml-4 text-right">{userEmail}</span>
                              </div>
                            )}
                            {googleUserId && (
                              <div className="flex items-center justify-between px-4 min-h-[44px] py-2.5 border-t border-[#c6c6c8]/30">
                                <span className="text-[15px] text-[#1c1c1e]">Signed-in Google Account ID</span>
                                <span className="text-[13px] font-mono text-[#8e8e93]">{googleUserId}</span>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <SectionLabel className="mt-1">Edit Profile</SectionLabel>
                      <div className="bg-white rounded-2xl shadow-sm border border-black/[0.04] p-4 space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <InputField label="First Name" value={form.firstName} onChange={(e: any) => setForm({ ...form, firstName: e.target.value })} placeholder="e.g. Jane" />
                          <InputField label="Last Name" value={form.lastName} onChange={(e: any) => setForm({ ...form, lastName: e.target.value })} placeholder="e.g. Doe" />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <InputField label="Profession" value={form.profession} onChange={(e: any) => setForm({ ...form, profession: e.target.value })} placeholder="e.g. Medical Student" />
                          <InputField label="Department" value={form.department} onChange={(e: any) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Surgery" />
                        </div>
                        <InputField label="University / Institution" value={form.university} onChange={(e: any) => setForm({ ...form, university: e.target.value })} placeholder="e.g. University of the Witwatersrand" />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <InputField label="City" value={form.city} onChange={(e: any) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Johannesburg" />
                          <InputField label="Postal Code" value={form.postalCode} onChange={(e: any) => setForm({ ...form, postalCode: e.target.value })} placeholder="e.g. 2000" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ════════ TEMPLATES TAB ════════ */}
              {activeTab === 'templates' && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <SectionLabel className="mt-1">Documentation Templates</SectionLabel>
                  <p className="text-[13px] text-[#8e8e93] px-4 mb-4">
                    Set the default structure for AI-generated clinical notes.
                  </p>

                  <div className="bg-white rounded-2xl shadow-sm border border-black/[0.04] p-1 mb-5 flex">
                    {(['soap', 'custom', 'practice'] as TemplateTabType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTemplateTab(t)}
                        className={`flex-1 min-h-[36px] rounded-xl text-[13px] font-semibold transition-all duration-200 uppercase tracking-wide ${
                          templateTab === t
                            ? 'bg-teal-600 text-white shadow-sm'
                            : 'text-[#8e8e93] hover:text-[#3c3c43]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04] p-4">
                    {templateTab === 'soap' && (
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#34c759]/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="text-[#34c759]" size={16} />
                        </div>
                        <div>
                          <p className="text-[15px] font-semibold text-[#1c1c1e]">Standard SOAP Format</p>
                          <p className="text-[13px] text-[#8e8e93] mt-1 leading-relaxed">
                            The default standard. Notes will be strictly structured into Subjective, Objective, Assessment, and Plan sections.
                          </p>
                        </div>
                      </div>
                    )}

                    {templateTab === 'custom' && (
                      <div className="space-y-5">
                        <div>
                          <p className="text-[13px] font-semibold text-[#8e8e93] uppercase tracking-wide mb-3">
                            Templates from API (demo)
                          </p>
                          <CustomTemplates />
                        </div>
                        <div className="border-t border-[#c6c6c8]/30 pt-4">
                          <p className="text-[13px] font-semibold text-[#8e8e93] uppercase tracking-wide mb-3">
                            Your custom template
                          </p>
                          {form.customTemplateContent ? (
                            <textarea
                              className="w-full min-h-[140px] p-4 rounded-xl border border-[#d1d1d6] font-mono text-[13px] focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none resize-none bg-[#f2f2f7]"
                              value={form.customTemplateContent}
                              onChange={(e) => setForm({ ...form, customTemplateContent: e.target.value })}
                            />
                          ) : (
                            <div
                              onClick={() => fileInputRef.current?.click()}
                              className="min-h-[140px] border-2 border-dashed border-[#d1d1d6] bg-[#f2f2f7] rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-teal-500 hover:bg-teal-50/50 transition-all"
                            >
                              <Upload className="text-[#8e8e93] mb-2" size={20} />
                              <p className="text-[13px] font-medium text-[#8e8e93]">Tap to upload .txt or .md template</p>
                            </div>
                          )}
                          <input ref={fileInputRef} type="file" className="hidden" onChange={handleTemplateUpload} />
                          {uploadError && (
                            <p className="text-[13px] text-[#ff3b30] mt-2">{uploadError}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {templateTab === 'practice' && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[15px] font-semibold text-[#1c1c1e]">Template Playground</h4>
                          <p className="text-[13px] text-[#8e8e93] mt-0.5">
                            Select a template, choose or type clinical input, and generate a test note.
                          </p>
                        </div>
                        <TemplatePlayground />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ════════ CLINICAL TOOLS TAB ════════ */}
              {activeTab === 'tools' && (
                <div className="animate-in fade-in slide-in-from-right-4">

                  {/* BMI Calculator */}
                  <SectionLabel className="mt-1">Quick Calculator</SectionLabel>
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04] p-4 mb-3">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center">
                        <BarChart3 size={16} className="text-teal-600" />
                      </div>
                      <h4 className="text-[15px] font-semibold text-[#1c1c1e]">Body Mass Index</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <InputField label="Weight (kg)" type="text" inputMode="decimal" value={bmiWeight} onChange={(e: any) => setBmiWeight(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="70" />
                      <InputField label="Height (cm)" type="text" inputMode="decimal" value={bmiHeight} onChange={(e: any) => setBmiHeight(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="175" />
                    </div>
                    {bmiResult && (
                      <div className="mt-4 pt-4 border-t border-[#c6c6c8]/30 flex items-end justify-between animate-in fade-in">
                        <div>
                          <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-0.5">Result</p>
                          <p className="text-[28px] font-bold text-[#1c1c1e] leading-none tracking-tight">{bmiResult}</p>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          parseFloat(bmiResult) < 18.5 ? 'bg-teal-500/10 text-teal-600' :
                          parseFloat(bmiResult) < 25 ? 'bg-[#34c759]/10 text-[#34c759]' :
                          parseFloat(bmiResult) < 30 ? 'bg-[#ff9500]/10 text-[#ff9500]' :
                          'bg-[#ff3b30]/10 text-[#ff3b30]'
                        }`}>
                          {parseFloat(bmiResult) < 18.5 ? 'Underweight' : parseFloat(bmiResult) < 25 ? 'Healthy' : parseFloat(bmiResult) < 30 ? 'Overweight' : 'Obese'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Global Scoring Systems — all categories, no height cap */}
                  <SectionLabel className="mt-7">Scoring Systems</SectionLabel>
                  <p className="text-[13px] text-[#8e8e93] px-4 mb-3">
                    Configured for <span className="font-medium text-[#1c1c1e]">{form.department || 'your profile'}</span>. Tap any tool to open.
                  </p>
                  {scoringByCategory.map(([category, systems]) => {
                    const theme = getCategoryTheme(category);
                    const Icon = theme.icon;
                    return (
                      <div key={category} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04] mb-3">
                        <div className="flex items-center gap-3 px-4 min-h-[44px] py-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${theme.bg} ${theme.text}`}>
                            <Icon size={14} />
                          </div>
                          <span className="text-[15px] font-semibold text-[#1c1c1e] flex-1">{category}</span>
                          <span className="text-[13px] text-[#8e8e93]">{systems.length}</span>
                        </div>
                        <div className="divide-y divide-[#c6c6c8]/30">
                          {systems
                            .slice()
                            .sort((a, b) => a.title.localeCompare(b.title))
                            .map((system) => (
                              <button
                                key={system.id}
                                type="button"
                                onClick={() => setActiveScoringId(system.id)}
                                className="w-full flex items-center gap-3 px-4 min-h-[44px] py-2.5 text-left hover:bg-[#f2f2f7]/50 active:bg-[#d1d1d6]/30 transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-[15px] text-[#1c1c1e]">{system.title}</p>
                                  <p className="text-[12px] text-[#8e8e93] mt-0.5 line-clamp-1">{system.description}</p>
                                </div>
                                <ChevronRight size={16} className="text-[#c7c7cc] shrink-0" />
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Nephrology eGFR */}
                  {showNephro && (
                    <>
                      <SectionLabel className="mt-7">Specialty Tools</SectionLabel>
                      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04] p-4 mb-3">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                            <Droplets size={14} />
                          </div>
                          <span className="text-[15px] font-semibold text-[#1c1c1e]">eGFR (MDRD)</span>
                        </div>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <InputField label="Age" type="text" inputMode="decimal" value={egfrAge} onChange={(e: any) => setEgfrAge(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Yrs" />
                            <div className="space-y-1">
                              <label className="block text-[13px] font-medium text-[#3c3c43]/60">Sex</label>
                              <select
                                value={egfrSex}
                                onChange={(e) => setEgfrSex(e.target.value as 'M' | 'F')}
                                className="w-full min-h-[44px] px-4 py-2.5 text-[15px] rounded-xl bg-white text-[#1c1c1e] outline-none border border-[#d1d1d6] focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                              >
                                <option value="M">Male</option>
                                <option value="F">Female</option>
                              </select>
                            </div>
                          </div>
                          <InputField label="Creatinine (mg/dL)" type="text" inputMode="decimal" value={egfrCr} onChange={(e: any) => setEgfrCr(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 1.2" />

                          {egfrResult !== null && (
                            <div className="pt-3 mt-2 border-t border-[#c6c6c8]/30 flex justify-between items-end">
                              <div>
                                <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-0.5">mL/min/1.73m²</p>
                                <p className="text-[28px] font-bold text-[#1c1c1e] leading-none tracking-tight">{egfrResult}</p>
                              </div>
                              <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                                egfrResult > 60 ? 'bg-[#34c759]/10 text-[#34c759]' : 'bg-[#ff3b30]/10 text-[#ff3b30]'
                              }`}>
                                {egfrResult > 60 ? 'Normal' : 'Reduced'}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Mobile workspace preference */}
                  <SectionLabel className="mt-7">Preferences</SectionLabel>
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04]">
                    <div className="flex items-center justify-between gap-3 px-4 min-h-[44px] py-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-7 h-7 bg-teal-500/10 rounded-lg flex items-center justify-center shrink-0">
                          <Smartphone size={14} className="text-teal-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] text-[#1c1c1e]">Scoring in bottom bar</p>
                          <p className="text-[12px] text-[#8e8e93] leading-snug">Small screens only</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {savingBottomNavPref && (
                          <Loader2 className="h-4 w-4 animate-spin text-teal-600" aria-hidden />
                        )}
                        <IOSToggle
                          checked={form.showScoringInBottomNav !== false}
                          disabled={savingBottomNavPref}
                          onChange={(v) => void handleShowScoringInBottomNavChange(v)}
                          label="Show scoring in mobile bottom navigation"
                        />
                      </div>
                    </div>
                  </div>

                  <SectionLabel className="mt-7">Modules</SectionLabel>
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04]">
                    <div className="flex items-center justify-between gap-3 px-4 min-h-[44px] py-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-7 h-7 bg-cyan-500/10 rounded-lg flex items-center justify-center shrink-0">
                          <LayoutPanelTop size={14} className="text-cyan-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] text-[#1c1c1e]">Admissions board</p>
                          <p className="text-[12px] text-[#8e8e93] leading-snug">Show Admissions in the sidebar</p>
                        </div>
                      </div>
                      <IOSToggle
                        checked={form.modules?.admissions ?? false}
                        onChange={(enabled) =>
                          setForm((prev) => ({
                            ...prev,
                            modules: {
                              ...(prev.modules || { admissions: false }),
                              admissions: enabled,
                            },
                          }))
                        }
                        label="Enable admissions board module"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ════════ AUTOMATIONS TAB ════════ */}
              {activeTab === 'automations' && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <SectionLabel className="mt-1">Background Automations</SectionLabel>
                  <p className="text-[13px] text-[#8e8e93] px-4 mb-4">
                    Manage syncs and background processing tasks.
                  </p>

                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-black/[0.04] p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        schedulerRunning ? 'bg-teal-500/10' : 'bg-[#f2f2f7]'
                      }`}>
                        <RefreshCw size={16} className={schedulerRunning ? 'text-teal-600 animate-spin' : 'text-[#8e8e93]'} />
                      </div>
                      <div>
                        <h4 className="text-[15px] font-semibold text-[#1c1c1e]">File Conversion Scheduler</h4>
                        <p className="text-[12px] text-[#8e8e93]">Syncs and processes external Drive documents.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleRunScheduler}
                      disabled={schedulerRunning}
                      className="w-full min-h-[44px] bg-teal-600 text-white py-2.5 rounded-xl text-[15px] font-semibold hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 transition-colors"
                    >
                      {schedulerRunning ? 'Processing...' : 'Run Sync Now'}
                    </button>
                    {schedulerMessage && (
                      <p className="text-center text-[13px] text-[#34c759] font-medium mt-3">{schedulerMessage}</p>
                    )}
                  </div>

                </div>
              )}

              {/* ════════ USAGE TAB ════════ */}
              {activeTab === 'usage' && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <SectionLabel className="mt-1">System Usage</SectionLabel>
                  <p className="text-[13px] text-[#8e8e93] px-4 mb-4">
                    Analytics on your time saved and AI interactions.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Notes Scribed', value: '42', accent: 'text-[#34c759]', bg: 'bg-[#34c759]/10' },
                      { label: 'Est. Time Saved', value: '8.4 hrs', accent: 'text-teal-600', bg: 'bg-teal-500/10' },
                      { label: 'Summaries', value: '128', accent: 'text-indigo-600', bg: 'bg-indigo-50' },
                      { label: 'Automations', value: '3', accent: 'text-[#ff9500]', bg: 'bg-[#ff9500]/10' },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-white rounded-2xl shadow-sm border border-black/[0.04] p-4 flex flex-col">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8e8e93] mb-2">{stat.label}</p>
                        <p className={`text-[28px] font-bold leading-none tracking-tight ${stat.accent}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── SAVE FOOTER ── */}
          {showSaveFooter && (
            <div className="px-4 sm:px-6 py-3 border-t border-black/[0.06] bg-[#f2f2f7]/80 backdrop-blur-xl flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 shrink-0 animate-in slide-in-from-bottom-2">
              <button
                onClick={() => setEditMode(false)}
                className="min-h-[44px] px-5 py-2 text-[15px] font-medium text-[#ff3b30] hover:bg-[#ff3b30]/10 rounded-xl transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (editMode && requiredFieldsMissing)}
                className="min-h-[44px] bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white px-6 py-2 rounded-xl text-[15px] font-semibold shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
            </div>
          )}
        </div>

        {/* ═══ SCORING CALCULATOR OVERLAY ═══ */}
        {activeScoringSystem && (
          <div
            className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setActiveScoringId(null)}
          >
            <div
              className="w-full sm:max-w-xl h-[92dvh] sm:h-auto sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-[#f2f2f7] shadow-2xl border border-black/[0.04]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] bg-[#f2f2f7]/80 backdrop-blur-xl rounded-t-3xl sm:rounded-t-2xl shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveScoringId(null)}
                  className="text-teal-600 text-[15px] font-medium min-h-[44px] flex items-center"
                >
                  Done
                </button>
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8e8e93]">
                    {activeScoringSystem.category}
                  </span>
                  <span className="text-[15px] font-semibold text-[#1c1c1e]">
                    {activeScoringSystem.title}
                  </span>
                </div>
                <div className="w-[44px]" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 [-webkit-overflow-scrolling:touch] custom-scrollbar overscroll-contain">
                <CalculatorView system={activeScoringSystem} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
