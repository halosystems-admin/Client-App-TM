import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Play, FileText, X } from 'lucide-react';
import type { TemplateItem } from '../../../../shared/types';
import { ApiError } from '../../services/api';
import { getTemplates } from '../../services/api';

interface GeneratedOutput {
  title: string;
  patient_details: string;
  date: string;
  clinical_narrative: string;
  plan: string;
  status: string;
}

const DEMO_SCRIPTS: Record<string, Array<{ label: string; text: string }>> = {
  discharge_summary: [
    {
      label: 'Pneumonia (Uncomplicated)',
      text: 'Patient admitted on 12 March with fever and productive cough. Chest X-ray confirmed right lower lobe pneumonia. Started on IV Ceftriaxone and Azithromycin. Switched to oral Augmentin on day 3 after fever resolved. Vitals stable, satting 98% on room air. Discharged with 5 days of oral antibiotics and follow up in 1 week.',
    },
    {
      label: 'Post-Op Appendectomy',
      text: '24yo male admitted for acute appendicitis. Underwent laparoscopic appendectomy on 14 March. Surgery uncomplicated. Post-op recovery smooth. Tolerating full diet, passing flatus. Wounds clean and dry. Discharged with analgesia and 1 week sick note.',
    },
  ],
  echo_report: [
    {
      label: 'Normal Echo',
      text: 'LVIDd 4.5cm, LVPWd 0.9cm, IVSd 0.9cm. Ejection fraction visually estimated at 60%. Normal LV size and systolic function. No regional wall motion abnormalities. Normal RV size and function. Valves structurally normal with trace MR and trace TR. No pericardial effusion.',
    },
    {
      label: 'Mild Heart Failure',
      text: 'Dilated LV with LVIDd 6.2cm. Global hypokinesis. LVEF visually estimated at 35-40%. Grade 1 diastolic dysfunction. Moderate mitral regurgitation. Mild tricuspid regurgitation with RVSP 35mmHg. No pericardial effusion.',
    },
  ],
  op_note: [
    {
      label: 'Incision and Drainage',
      text: 'Patient presented with 4cm fluctuant abscess on right forearm. Prepped and draped in sterile fashion. Local anesthesia with 1% lidocaine. 2cm incision made over the point of maximum fluctuance. Approx 15cc of purulent fluid drained. Cavity irrigated with saline and loosely packed with iodoform ribbon. Patient tolerated procedure well.',
    },
  ],
  default: [
    {
      label: 'Standard Progress Note',
      text: 'Patient complains of worsening headache for 2 days, rated 6/10. Throbbing, frontal. No photophobia, no nausea. Vitals: BP 120/80, HR 75, Temp 37.0. Neuro exam unremarkable. PEARL. Gait normal. Impression: Tension headache. Plan: Prescribed paracetamol, advised hydration and rest. Return if symptoms worsen.',
    },
  ],
};

function getScriptKey(template: TemplateItem): string {
  const raw = (template.id || template.name || '').toLowerCase().replace(/\s+/g, '_');
  if (raw && raw in DEMO_SCRIPTS) return raw;
  return 'default';
}

export function TemplatePlayground() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [inputText, setInputText] = useState('');
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [generatedOutput, setGeneratedOutput] = useState<GeneratedOutput | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const templatesArray = await getTemplates();
      setTemplates(templatesArray);
      if (templatesArray.length > 0 && !selectedTemplate) {
        setSelectedTemplate(templatesArray[0]);
      }
    } catch (err) {
      console.error('Fetch Error:', err);
      if (err instanceof ApiError && err.status === 401) {
        setFetchError('Session expired. Please sign in again to load templates.');
      } else {
        setFetchError('Could not load templates. See console for details.');
      }
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const scriptKey = selectedTemplate ? getScriptKey(selectedTemplate) : 'default';
  const scripts = useMemo(() => DEMO_SCRIPTS[scriptKey] ?? DEMO_SCRIPTS.default, [scriptKey]);

  const handleSelectScript = (text: string) => {
    setInputText(text);
    setGeneratedContent(null);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!selectedTemplate || !inputText.trim()) {
      setError('Select a template and enter or choose clinical input.');
      return;
    }

    setError(null);
    setGenerateLoading(true);
    setGeneratedContent(null);
    setGeneratedOutput(null);

    const selectedScript = inputText.trim();
    setTimeout(() => {
      setGeneratedOutput({
        title: selectedTemplate?.name ?? 'Clinical Note',
        patient_details: 'Generated from Demo Script',
        date: new Date().toLocaleDateString(),
        clinical_narrative: selectedScript,
        plan: 'Follow-up as discussed.',
        status: 'CONFIDENTIAL - DO NOT DISTRIBUTE',
      });
      setGenerateLoading(false);
      setShowModal(true);
    }, 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 p-4">
        <Loader2 size={16} className="animate-spin text-teal-500" />
        Fetching practice templates…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-4 rounded-xl border border-red-200 bg-red-50/50">
        <p className="text-sm text-red-700">{fetchError}</p>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="p-4 text-center rounded-xl border border-slate-200 bg-slate-50/50">
        <p className="text-sm text-slate-600">No practice templates available.</p>
        <p className="text-xs text-slate-500 mt-1">Ensure your API connection is live and templates are configured.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">1. Select template</p>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSelectedTemplate(t);
                setGeneratedContent(null);
                setError(null);
              }}
              className={`min-h-11 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                selectedTemplate?.id === t.id
                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {t.name ?? t.label ?? t.id}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">2. Clinical input</p>
        <p className="text-xs text-slate-500 mb-2">Choose a script or type your own below.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {scripts.map((script, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelectScript(script.text)}
              className={`min-h-11 px-3 py-2 rounded-md text-xs font-medium border transition-all ${
                inputText === script.text
                  ? 'bg-teal-100 border-teal-300 text-teal-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {script.label}
            </button>
          ))}
        </div>
        <textarea
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setGeneratedContent(null);
            setError(null);
          }}
          placeholder="Paste or type clinical content to transform with the selected template…"
          className="w-full min-h-[120px] p-3 rounded-lg border border-slate-200 text-sm font-mono bg-slate-50/50 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none resize-y"
          rows={5}
        />
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generateLoading || !selectedTemplate || !inputText.trim()}
          className="inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {generateLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          Generate test note
        </button>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      {generatedContent != null && (
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText size={12} />
            Generated note
          </p>
          <div className="p-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 whitespace-pre-wrap font-mono max-h-[280px] overflow-y-auto custom-scrollbar">
            {generatedContent}
          </div>
        </div>
      )}

      {showModal && generatedOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-slate-200">
            <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-700">Generated Note</span>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="inline-flex h-11 w-11 items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-4 sm:p-6 space-y-4 font-sans text-slate-800">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-300 pb-1 mb-2">
                    {generatedOutput.title}
                  </h3>
                  <p className="text-xs text-slate-500">{generatedOutput.patient_details}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{generatedOutput.date}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Clinical narrative</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{generatedOutput.clinical_narrative}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Plan</p>
                  <p className="text-sm">{generatedOutput.plan}</p>
                </div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider pt-2 border-t border-slate-200">
                  {generatedOutput.status}
                </p>
              </div>
            </div>
            <div className="px-3 sm:px-5 py-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="min-h-11 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
