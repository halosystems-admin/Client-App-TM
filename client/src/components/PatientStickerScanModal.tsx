import React, { useRef, useState } from 'react';
import { X, Loader2, Upload, AlertCircle } from 'lucide-react';
import { extractPatientStickerFromImage, createPatient } from '../services/api';
import { AppStatus } from '../../../shared/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (patientId: string) => void;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type Step = 'scan' | 'confirm' | 'success';

export const PatientStickerScanModal: React.FC<Props> = ({
  open,
  onClose,
  onSuccess,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('scan');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Extracted data
  const [extractedPatientName, setExtractedPatientName] = useState('');
  const [extractedPatientId, setExtractedPatientId] = useState('');

  // Form fields for confirmation step
  const [givenName, setGivenName] = useState('');
  const [surname, setSurname] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<'M' | 'F'>('M');

  if (!open) return null;

  const parseName = (fullName: string): { givenName: string; surname: string } => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) {
      return { givenName: fullName, surname: '' };
    }
    // Assume last part is surname, rest is given name
    const surname = parts[parts.length - 1];
    const givenName = parts.slice(0, -1).join(' ');
    return { givenName, surname };
  };

  const normalizeDob = (value?: string): string => {
    if (!value) return '';

    const trimmed = value.trim();
    if (!trimmed) return '';

    const isoMatch = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const dmyMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    }

    return trimmed;
  };

  const normalizeSex = (value?: string): 'M' | 'F' | null => {
    if (!value) return null;

    const normalized = value.trim().toLowerCase();
    if (['m', 'male', 'man', 'boy'].includes(normalized)) {
      return 'M';
    }

    if (['f', 'female', 'woman', 'girl'].includes(normalized)) {
      return 'F';
    }

    return null;
  };

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          setImagePreview(reader.result as string);

          // Call extraction API
          const result = await extractPatientStickerFromImage(base64);

          if (!result.patient_name || !result.patient_id) {
            setError('No patient data found in sticker. Please try another image.');
            setImagePreview(null);
            setLoading(false);
            return;
          }

          setExtractedPatientName(result.patient_name);
          setExtractedPatientId(result.patient_id);

          // Parse name
          const { givenName: parsedGiven, surname: parsedSurname } = parseName(result.patient_name);
          setGivenName(parsedGiven);
          setSurname(parsedSurname);

          // Prefer DOB/gender from the extraction result; if missing and we have a patient_id,
          // fetch the existing patient record and use its DOB/gender when available.
          let finalDob = normalizeDob(result.dob);
          let finalSex = normalizeSex(result.gender) || null;
          if ((!finalDob || finalDob === '') && result.patient_id) {
            try {
              const existing = await getPatient(result.patient_id);
              if (existing && existing.dob && existing.dob !== 'Unknown') {
                finalDob = normalizeDob(existing.dob);
              }
              if (!finalSex && existing && existing.sex) {
                finalSex = existing.sex as 'M' | 'F';
              }
            } catch (err) {
              // ignore fetch errors and fall back to extraction values
            }
          }

          setDob(finalDob);
          setSex(finalSex || 'M');

          setStep('confirm');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to extract patient data.');
          setImagePreview(null);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file.');
      setLoading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleSubmit = async () => {
    if (!givenName.trim() || !dob) {
      onToast('Please fill in all required fields.', 'error');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Combine given name and surname
      const fullName = `${givenName.trim()} ${surname.trim()}`.trim();
      if (fullName.length < 2) {
        setError('Patient name must be at least 2 characters.');
        setLoading(false);
        return;
      }

      // Create patient using existing API
      const patient = await createPatient(fullName, dob, sex);
      setStep('success');
      onSuccess(patient.id);
      onToast(`Patient "${fullName}" created successfully.`, 'success');

      // Reset after 2 seconds and close
      setTimeout(() => {
        resetForm();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep('scan');
    setImagePreview(null);
    setExtractedPatientName('');
    setExtractedPatientId('');
    setGivenName('');
    setSurname('');
    setDob('');
    setSex('M');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleReset = () => {
    resetForm();
    setStep('scan');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex justify-between items-center border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">
            {step === 'scan' && 'Scan Patient Sticker'}
            {step === 'confirm' && 'Confirm Patient Data'}
            {step === 'success' && 'Patient Created'}
          </h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error state */}
          {error && (
            <div className="flex gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-rose-900">{error}</p>
                {step === 'scan' && (
                  <button
                    onClick={handleReset}
                    className="text-xs font-medium text-rose-700 mt-1 hover:underline"
                  >
                    Try again
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 1: Scan */}
          {step === 'scan' && (
            <>
              <p className="text-sm text-slate-600">
                Capture or upload an image of the patient sticker to extract patient information.
              </p>

              {/* File upload area */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer transition hover:border-slate-300 hover:bg-slate-50"
              >
                {imagePreview ? (
                  <div className="space-y-3">
                    <img src={imagePreview} alt="Sticker preview" className="w-32 h-32 object-cover rounded-lg mx-auto" />
                    <p className="text-sm font-medium text-slate-700">Image selected</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-sm font-medium text-slate-700">Drag image or click to upload</p>
                    <p className="text-xs text-slate-500">PNG, JPG, or other image formats</p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Select Image
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step 2: Confirm */}
          {step === 'confirm' && (
            <>
              <p className="text-sm text-slate-600">
                Review and edit the extracted patient information below.
              </p>

              <div className="space-y-3 bg-slate-50 p-4 rounded-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Patient Sticker ID
                  </label>
                  <input
                    type="text"
                    value={extractedPatientId}
                    disabled
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-mono disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Read-only from sticker</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Given Name
                    </label>
                    <input
                      type="text"
                      value={givenName}
                      onChange={(e) => setGivenName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Surname
                    </label>
                    <input
                      type="text"
                      value={surname}
                      onChange={(e) => setSurname(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Date of Birth <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="YYYY/MM/DD"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Gender <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex bg-slate-200 p-1 rounded-lg gap-1">
                    <button
                      onClick={() => setSex('M')}
                      className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                        sex === 'M'
                          ? 'bg-white text-teal-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Male
                    </button>
                    <button
                      onClick={() => setSex('F')}
                      className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                        sex === 'F'
                          ? 'bg-white text-teal-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Female
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Scan Again
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !dob}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Patient'
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">Patient Created</p>
                <p className="text-sm text-slate-500 mt-1">
                  {givenName && surname
                    ? `${givenName} ${surname}`
                    : givenName}
                </p>
              </div>
              <p className="text-xs text-slate-400">Closing in 2 seconds...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
