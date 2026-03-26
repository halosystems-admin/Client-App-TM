import React, { useState, useEffect, useRef } from 'react';
import type { UserSettings } from '../../../shared/types';
import {
  X, Pencil, Save, User, Clock, Briefcase, MapPin, GraduationCap,
  FileText, Upload, Check, AlertCircle, RefreshCw, Loader2,
  Settings as SettingsIcon, BarChart3, Plus, Droplets, Activity, Brain, Smartphone,
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
  showScoringInBottomNav: true,
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
  /** When the modal opens, switch to this tab (e.g. profile from empty-state CTA). */
  initialTab?: SettingsModalTab;
  /** If `initialTab` is `profile`, open directly in edit mode. */
  openProfileInEditMode?: boolean;
}

export type SettingsModalTab = 'profile' | 'templates' | 'tools' | 'automations' | 'usage';
type TabType = SettingsModalTab;
type TemplateTabType = 'soap' | 'custom' | 'practice';

// 1. Paste this ABOVE the export const SettingsModal line!
const InputField = ({ label, value, onChange, placeholder, type = "text", inputMode }: any) => (
  <div className="space-y-1.5 flex-1">
    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
    <input 
      type={type} 
      inputMode={inputMode}
      value={value} 
      onChange={onChange} 
      placeholder={placeholder} 
      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm placeholder:text-slate-300" 
    />
  </div>
);

function getCategoryTheme(category: string): { icon: React.ElementType; bg: string; text: string } {
  const c = category.toLowerCase();
  if (c.includes('cardio') || c.includes('pulmon')) {
    // Cardiology / Pulmonology – pulse/heart vibe
    return { icon: Activity, bg: 'bg-rose-50', text: 'text-rose-600' };
  }
  if (c.includes('neuro') || c.includes('psych')) {
    // Neurology / Psychiatry
    return { icon: Brain, bg: 'bg-purple-50', text: 'text-purple-600' };
  }
  if (c.includes('hepato') || c.includes('gastro') || c.includes('liver')) {
    // Hepatology / Gastroenterology
    return { icon: Briefcase, bg: 'bg-amber-50', text: 'text-amber-600' };
  }
  if (c.includes('infect') || c.includes('critical') || c.includes('icu')) {
    // Infectious Disease / Critical Care
    return { icon: AlertCircle, bg: 'bg-orange-50', text: 'text-orange-600' };
  }
  // Default neutral medical tool
  return { icon: Activity, bg: 'bg-slate-100', text: 'text-slate-600' };
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  userEmail,
  userId,
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
    (settings?.noteTemplate === 'custom' ? 'custom' : 'soap')
  );
  
  const [uploadError, setUploadError] = useState('');
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- BMI STATE ---
  const [bmiWeight, setBmiWeight] = useState<string>('');
  const [bmiHeight, setBmiHeight] = useState<string>('');

  // --- SPECIALTY TOOLS STATE ---
  const [egfrAge, setEgfrAge] = useState<string>('');
  const [egfrSex, setEgfrSex] = useState<'M' | 'F'>('M');
  const [egfrCr, setEgfrCr] = useState<string>('');

  const [wellsCriteria, setWellsCriteria] = useState({
    cancer: false, paralysis: false, bedridden: false, tenderness: false,
    swollenLeg: false, calfSwelling: false, pittingEdema: false,
    collateralVeins: false, prevDVT: false, altDiagnosis: false
  });

  const [gcsEye, setGcsEye] = useState<number>(4);
  const [gcsVerbal, setGcsVerbal] = useState<number>(5);
  const [gcsMotor, setGcsMotor] = useState<number>(6);

  // --- GLOBAL SCORING STATE ---
  const [activeScoringId, setActiveScoringId] = useState<string | null>(null);
  const [savingBottomNavPref, setSavingBottomNavPref] = useState(false);

  // --- CALCULATIONS ---
  const calculateBMI = () => {
    const w = parseFloat(bmiWeight);
    const h = parseFloat(bmiHeight) / 100;
    if (w > 0 && h > 0) return (w / (h * h)).toFixed(1);
    return null; 
  }
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

  // --- CONDITIONAL RENDERING LOGIC ---
  const dept = (form.department || '').toLowerCase();
  const showNephro = dept.includes('nephrology');
  const showSurgery = dept.includes('surgery') || dept.includes('internal medicine') || dept.includes('im');
  const showEmergency = dept.includes('emergency') || dept.includes('general') || dept.includes('er');
  const showSuggested = !showNephro && !showSurgery && !showEmergency;

  // --- CORE LOGIC FUNCTIONS ---
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated: UserSettings = { 
        ...form, 
        noteTemplate: templateTab === 'custom' ? 'custom' : 'soap' 
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

  // --- EFFECTS ---
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
  const hasUnsavedTemplateChanges = templateTab !== 'practice' && templateTab !== (settings?.noteTemplate || 'soap');
  const showSaveFooter = editMode || hasUnsavedTemplateChanges;

  // --- UI COMPONENTS ---
  const NavButton = ({ id, label, icon: Icon }: { id: TabType, label: string, icon: React.ElementType }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
        activeTab === id 
          ? 'bg-teal-50 text-teal-700 font-semibold shadow-sm border border-teal-100/50' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 font-medium'
      }`}
    >
      <Icon size={16} className={activeTab === id ? 'text-teal-600' : 'text-slate-400'} /> 
      {label}
    </button>
  );


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 font-sans">
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[600px] flex overflow-hidden animate-in fade-in zoom-in-95 border border-slate-200/60">
        
        {/* SIDEBAR NAV */}
        <div className="w-56 bg-slate-50/50 border-r border-slate-200/60 p-5 flex flex-col">
          <div className="mb-6 px-1">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">System Config</h2>
            <p className="text-[10px] text-teal-600 font-semibold uppercase tracking-widest mt-0.5">Preferences</p>
          </div>

          <nav className="space-y-1 flex-1">
            <NavButton id="profile" label="Practitioner Profile" icon={User} />
            <NavButton id="templates" label="Note Templates" icon={FileText} />
            <NavButton id="tools" label="Clinical Tools" icon={RefreshCw} />
            <NavButton id="automations" label="Automations" icon={SettingsIcon} />
            <NavButton id="usage" label="Usage Metrics" icon={BarChart3} />
          </nav>

          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Session</span>
            </div>
            <p className="text-sm font-mono font-medium text-slate-700">{elapsed}</p>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 flex flex-col relative min-w-0 bg-white">
          <button onClick={onClose} className="absolute top-5 right-5 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-md transition-all z-10">
            <X size={18} />
          </button>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            
            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="max-w-xl animate-in fade-in slide-in-from-right-4">
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800">Practitioner Profile</h3>
                    <p className="text-xs text-slate-500 mt-1">Manage your clinical identity and primary department.</p>
                  </div>
                  <button onClick={() => setEditMode(!editMode)} className="text-teal-600 hover:bg-teal-50 border border-transparent hover:border-teal-100 px-3 py-1.5 rounded-md text-xs font-semibold transition-all">
                    {editMode ? 'Cancel' : 'Edit Details'}
                  </button>
                </div>
                
                {editMode ? (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <InputField label="First Name" value={form.firstName} onChange={(e: any) => setForm({...form, firstName: e.target.value})} placeholder="e.g. Jane" />
                      <InputField label="Last Name" value={form.lastName} onChange={(e: any) => setForm({...form, lastName: e.target.value})} placeholder="e.g. Doe" />
                    </div>
                    <div className="flex gap-4">
                      <InputField label="Profession" value={form.profession} onChange={(e: any) => setForm({...form, profession: e.target.value})} placeholder="e.g. Medical Student" />
                      <InputField label="Department" value={form.department} onChange={(e: any) => setForm({...form, department: e.target.value})} placeholder="e.g. Surgery" />
                    </div>
                    <InputField label="University / Institution" value={form.university} onChange={(e: any) => setForm({...form, university: e.target.value})} placeholder="e.g. University of the Witwatersrand" />
                    <div className="flex gap-4">
                      <InputField label="City" value={form.city} onChange={(e: any) => setForm({...form, city: e.target.value})} placeholder="e.g. Johannesburg" />
                      <InputField label="Postal Code" value={form.postalCode} onChange={(e: any) => setForm({...form, postalCode: e.target.value})} placeholder="e.g. 2000" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50/50 rounded-xl p-5 border border-slate-200/60 shadow-sm flex flex-col gap-5">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-700 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm ring-4 ring-teal-50">
                        {form.firstName?.[0] || ''}{form.lastName?.[0] || ''}
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-slate-800">{form.firstName || 'New'} {form.lastName || 'Practitioner'}</h4>
                        <p className="text-slate-500 text-sm">{form.profession || 'Profession not set'} • <span className="text-teal-700 font-medium">{form.department || 'Unassigned'}</span></p>
                      </div>
                    </div>
                    
                    {(form.university || form.city) && (
                      <div className="pt-4 border-t border-slate-200/60 grid grid-cols-2 gap-4">
                        {form.university && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <GraduationCap size={16} className="text-slate-400" />
                            <span className="text-xs font-medium">{form.university}</span>
                          </div>
                        )}
                        {(form.city || form.postalCode) && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <MapPin size={16} className="text-slate-400" />
                            <span className="text-xs font-medium">{form.city}{form.city && form.postalCode ? ', ' : ''}{form.postalCode}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {userId && (
                      <div className="mt-4 pt-3 border-t border-dashed border-slate-200 flex justify-end">
                        <span className="text-[10px] font-mono text-slate-400">
                          Notes user ID: {userId}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TEMPLATES TAB */}
            {activeTab === 'templates' && (
              <div className="animate-in fade-in slide-in-from-right-4 h-full flex flex-col">
                <div className="mb-5">
                  <h3 className="text-xl font-semibold text-slate-800">Documentation Templates</h3>
                  <p className="text-slate-500 text-xs mt-1">Set the default structure for AI-generated clinical notes.</p>
                </div>
                
                <div className="bg-slate-100/80 p-1 rounded-lg w-fit mb-5 flex gap-1">
                  {['soap', 'custom', 'practice'].map((t) => (
                    <button 
                      key={t}
                      onClick={() => setTemplateTab(t as TemplateTabType)}
                      className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all uppercase tracking-wider ${templateTab === t ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl p-5 shadow-sm overflow-y-auto">
                  {templateTab === 'soap' && (
                    <div className="flex items-start gap-3">
                      <Check className="text-teal-500 mt-0.5" size={16} />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Standard SOAP Format</p>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">The default standard. Notes will be strictly structured into Subjective, Objective, Assessment, and Plan sections.</p>
                      </div>
                    </div>
                  )}
                  {templateTab === 'custom' && (
                    <div className="h-full flex flex-col gap-5">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Templates from API (demo)</p>
                        <CustomTemplates />
                      </div>
                      <div className="border-t border-slate-200 pt-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Your custom template</p>
                        {form.customTemplateContent ? (
                          <textarea 
                            className="flex-1 w-full min-h-[120px] p-4 rounded-lg border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none resize-none bg-slate-50/50"
                            value={form.customTemplateContent}
                            onChange={(e) => setForm({...form, customTemplateContent: e.target.value})}
                          />
                        ) : (
                          <div onClick={() => fileInputRef.current?.click()} className="min-h-[120px] border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-all">
                            <Upload className="text-slate-400 mb-2" size={20} />
                            <p className="text-xs font-semibold text-slate-500">Click to upload .txt or .md template</p>
                          </div>
                        )}
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleTemplateUpload} />
                      </div>
                    </div>
                  )}
                  {templateTab === 'practice' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Template Playground</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Select a template, choose or type clinical input, and generate a test note.</p>
                      </div>
                      <TemplatePlayground userId={userId || 'demo'} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AUTOMATIONS TAB */}
            {activeTab === 'automations' && (
              <div className="animate-in fade-in slide-in-from-right-4 max-w-xl">
                <div className="mb-6 border-b border-slate-100 pb-4">
                  <h3 className="text-xl font-semibold text-slate-800">Background Automations</h3>
                  <p className="text-slate-500 text-xs mt-1">Manage syncs and background processing tasks.</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
                   <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${schedulerRunning ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-500'}`}>
                      <RefreshCw size={18} className={schedulerRunning ? 'animate-spin' : ''} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-slate-800">File Conversion Scheduler</h4>
                      <p className="text-xs text-slate-500">Syncs and processes external Drive documents.</p>
                    </div>
                   </div>
                   <button 
                     onClick={handleRunScheduler}
                     disabled={schedulerRunning}
                     className="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors mt-2"
                   >
                     {schedulerRunning ? 'Processing Database...' : 'Run Sync Now'}
                   </button>
                   {schedulerMessage && <p className="text-center text-xs text-teal-600 font-medium">{schedulerMessage}</p>}
                </div>
              </div>
            )}

            {/* CLINICAL TOOLS TAB */}
            {activeTab === 'tools' && (
              <div className="animate-in fade-in slide-in-from-right-4 max-w-3xl">
                <div className="mb-6 border-b border-slate-100 pb-4">
                  <h3 className="text-xl font-semibold text-slate-800 tracking-tight">Clinical Calculators</h3>
                  <p className="text-slate-500 text-xs mt-1">Dynamically configured for <span className="font-medium text-slate-700">{form.department || 'your profile'}</span>.</p>
                </div>

                {/* Standalone BMI calculator */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:border-teal-200 hover:shadow-md transition-all h-fit group mb-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center group-hover:bg-teal-100 transition-colors">
                      <BarChart3 size={16} />
                    </div>
                    <h4 className="font-semibold text-sm text-slate-800">Body Mass Index</h4>
                  </div>

                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <InputField label="Weight (kg)" type="text" inputMode="decimal" value={bmiWeight} onChange={(e:any) => setBmiWeight(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 70" />
                      <InputField label="Height (cm)" type="text" inputMode="decimal" value={bmiHeight} onChange={(e:any) => setBmiHeight(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 175" />
                    </div>

                    {bmiResult && (
                      <div className="pt-4 mt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-1">
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Result</p>
                            <p className="text-2xl font-bold text-slate-800 leading-none">{bmiResult}</p>
                          </div>
                          <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            parseFloat(bmiResult) < 18.5 ? 'bg-blue-50 text-blue-600' : parseFloat(bmiResult) < 25 ? 'bg-teal-50 text-teal-700' : parseFloat(bmiResult) < 30 ? 'bg-orange-50 text-orange-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {parseFloat(bmiResult) < 18.5 ? 'Underweight' : parseFloat(bmiResult) < 25 ? 'Healthy' : parseFloat(bmiResult) < 30 ? 'Overweight' : 'Obese'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Global scoring calculators */}
                <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-4 mb-5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-3">
                    Global Clinical Scoring Systems
                  </p>
                  <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                    {Object.entries(
                      scoringConfig.systems.reduce<Record<string, ScoringSystem[]>>((acc, system) => {
                        acc[system.category] = acc[system.category] || [];
                        acc[system.category].push(system);
                        return acc;
                      }, {})
                    )
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([category, systems]) => (
                        <details key={category} className="bg-white border border-slate-200 rounded-xl shadow-sm">
                          <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer">
                            <span className="text-xs font-semibold text-slate-800">
                              {category}
                            </span>
                          </summary>
                          <div className="px-3 pb-2 pt-1 space-y-1.5">
                            {systems
                              .slice()
                              .sort((a, b) => a.title.localeCompare(b.title))
                              .map((system) => {
                                const theme = getCategoryTheme(system.category);
                                const Icon = theme.icon;
                                return (
                                  <button
                                    key={system.id}
                                    type="button"
                                    onClick={() => setActiveScoringId(system.id)}
                                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-transparent hover:border-slate-200 transition-colors"
                                  >
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${theme.bg} ${theme.text}`}>
                                      <Icon size={13} />
                                    </div>
                                    <span className="truncate">
                                      <span className="font-semibold">{system.category}</span>
                                      <span className="mx-1.5 text-slate-400">·</span>
                                      <span>{system.title}</span>
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </details>
                      ))}
                  </div>
                </div>

                {/* Accordion for legacy tools (eGFR) */}
                <div className="space-y-3">
                  {/* Nephrology: eGFR */}
                  {showNephro && (
                    <details className="bg-white border border-slate-200 rounded-2xl shadow-sm">
                      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                            <Droplets size={14} />
                          </div>
                          <span className="text-sm font-semibold text-slate-800">
                            Nephrology · eGFR (MDRD)
                          </span>
                        </div>
                      </summary>
                      <div className="px-4 pb-4 pt-1 space-y-3">
                        <div className="flex gap-3">
                          <InputField label="Age" type="text" inputMode="decimal" value={egfrAge} onChange={(e:any) => setEgfrAge(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Yrs" />
                          <div className="space-y-1.5 flex-1">
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Sex</label>
                            <select value={egfrSex} onChange={(e) => setEgfrSex(e.target.value as 'M'|'F')} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm">
                              <option value="M">Male</option>
                              <option value="F">Female</option>
                            </select>
                          </div>
                        </div>
                        <InputField label="Creatinine (mg/dL)" type="text" inputMode="decimal" value={egfrCr} onChange={(e:any) => setEgfrCr(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 1.2" />
                        
                        {egfrResult !== null && (
                          <div className="pt-3 mt-2 border-t border-slate-100 flex justify-between items-end">
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">mL/min/1.73m²</p>
                              <p className="text-2xl font-bold text-slate-800 leading-none">{egfrResult}</p>
                            </div>
                            <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${egfrResult > 60 ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'}`}>
                              {egfrResult > 60 ? 'Normal' : 'Reduced'}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>

                <div className="mt-5 border-t border-slate-200 pt-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Mobile workspace
                  </p>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <div className="flex min-w-0 items-start gap-2">
                      <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800">Scoring tab in bottom bar</p>
                        <p className="text-[10px] leading-snug text-slate-500">
                          Small screens only. Recording button stays as is.
                        </p>
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {savingBottomNavPref && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" aria-hidden />
                      )}
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        checked={form.showScoringInBottomNav !== false}
                        disabled={savingBottomNavPref}
                        onChange={(e) =>
                          void handleShowScoringInBottomNavChange(e.target.checked)
                        }
                        aria-label="Show scoring in mobile bottom navigation"
                      />
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* USAGE TAB */}
            {activeTab === 'usage' && (
              <div className="animate-in fade-in slide-in-from-right-4">
                <div className="mb-6 border-b border-slate-100 pb-4">
                  <h3 className="text-xl font-semibold text-slate-800">System Usage</h3>
                  <p className="text-slate-500 text-xs mt-1">Analytics on your time saved and AI interactions.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   {[
                     { label: 'Notes Scribed', value: '42', color: 'bg-teal-50/50 border-teal-100 text-teal-800' },
                     { label: 'Est. Time Saved', value: '8.4 hrs', color: 'bg-blue-50/50 border-blue-100 text-blue-800' },
                     { label: 'Summaries Processed', value: '128', color: 'bg-indigo-50/50 border-indigo-100 text-indigo-800' },
                     { label: 'Active Automations', value: '3', color: 'bg-slate-50/50 border-slate-200 text-slate-800' }
                   ].map(stat => (
                     <div key={stat.label} className={`p-5 rounded-xl border shadow-sm flex flex-col justify-center ${stat.color}`}>
                       <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">{stat.label}</p>
                       <p className="text-2xl font-bold leading-none">{stat.value}</p>
                     </div>
                   ))}
                </div>
              </div>
            )}
          </div>

          {/* SHARED FOOTER SAVE BAR */}
          {showSaveFooter && (
            <div className="px-8 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 rounded-br-xl animate-in slide-in-from-bottom-2">
              <button onClick={() => setEditMode(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">Discard</button>
              <button 
                onClick={handleSave}
                disabled={saving || (editMode && requiredFieldsMissing)}
                className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 flex items-center"
              >
                {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : <Save size={14} className="mr-2" />}
                Save Configuration
              </button>
            </div>
          )}
        </div>

        {/* INLINE SCORING CALCULATOR OVERLAY */}
        {activeScoringSystem && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
            onClick={() => setActiveScoringId(null)}
          >
            <div
              className="flex min-h-0 min-w-0 w-full max-w-xl max-h-[85vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveScoringId(null)}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-500 hover:text-teal-700 hover:border-teal-200 hover:bg-teal-50 transition-colors"
                  >
                    <X size={14} />
                  </button>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {activeScoringSystem.category}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {activeScoringSystem.title}
                    </span>
                  </div>
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 custom-scrollbar [-webkit-overflow-scrolling:touch]">
                <CalculatorView system={activeScoringSystem} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};