import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { useMediaQuery } from './hooks/useMediaQuery';
import { PatientWorkspace } from './pages/PatientWorkspace';
import { Toast } from './components/Toast';
import { SettingsModal, type SettingsModalTab } from './components/SettingsModal';
import {
  checkAuth,
  logout,
  fetchAllPatients,
  createPatient,
  deletePatient,
  loadSettings,
  saveSettings,
  getSchedulerStatus,
  runSchedulerNow,
  ApiError,
} from './services/api';
import { normalizeUserSettings } from '../../shared/types';
import type { Patient, UserSettings } from '../../shared/types';
import { LogIn, Loader, X, UserPlus, Calendar, Users, AlertTriangle, Trash2, Clock, Play, User, PanelLeft } from 'lucide-react';

const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage }))
);
const AdmissionsPage = lazy(() =>
  import('./pages/AdmissionsPage').then((m) => ({ default: m.AdmissionsPage }))
);

const HAS_OPENED_PATIENT_KEY = 'halo_hasOpenedPatient';

function readHasOpenedPatient(): boolean {
  try {
    return sessionStorage.getItem(HAS_OPENED_PATIENT_KEY) === '1';
  } catch {
    return false;
  }
}

function persistHasOpenedPatient(): void {
  try {
    sessionStorage.setItem(HAS_OPENED_PATIENT_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearHasOpenedPatient(): void {
  try {
    sessionStorage.removeItem(HAS_OPENED_PATIENT_KEY);
  } catch {
    /* ignore */
  }
}

function isPractitionerProfileComplete(s: UserSettings | null | undefined): boolean {
  if (!s) return false;
  return [s.firstName, s.lastName, s.profession, s.department].every((x) => !!String(x ?? '').trim());
}

type MainView = 'home' | 'calendar' | 'admissions';

export const App = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsDrawerOpen, setPatientsDrawerOpen] = useState(false);
  const [hasOpenedPatient, setHasOpenedPatient] = useState(() => {
    if (readHasOpenedPatient()) return true;
    try {
      return !!sessionStorage.getItem('halo_selectedPatientId');
    } catch {
      return false;
    }
  });
  const isLg = useMediaQuery('(min-width: 1024px)');
  const prevSelectedPatientRef = useRef<string | null | undefined>(undefined);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    () => sessionStorage.getItem('halo_selectedPatientId')
  );
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [mainView, setMainView] = useState<MainView>('home');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);

  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientDob, setNewPatientDob] = useState("");
  const [newPatientSex, setNewPatientSex] = useState<'M' | 'F'>('M');

  // Settings / profile state
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsModalTab | undefined>(undefined);
  const [settingsOpenProfileEdit, setSettingsOpenProfileEdit] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [userId, setUserId] = useState<string | undefined>();
  const [notesApiAvailable, setNotesApiAvailable] = useState(false);
  const [loginTime] = useState<number>(Date.now());

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Recently opened patients (stored in localStorage)
  const [recentPatientIds, setRecentPatientIds] = useState<string[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem('halo_recentPatientIds') || '[]');
      } catch { return []; }
    }
  );

  // Scheduler prompt state
  const [schedulerPrompt, setSchedulerPrompt] = useState<{ pending: number; due: number } | null>(null);
  const [schedulerRunning, setSchedulerRunning] = useState(false);

  // Persist selected patient to sessionStorage so it survives page refresh
  // Also track recently opened patients in localStorage
  const selectPatient = useCallback((id: string | null) => {
    setMainView('home');
    setSelectedPatientId(id);
    if (id) {
      sessionStorage.setItem('halo_selectedPatientId', id);
      persistHasOpenedPatient();
      setHasOpenedPatient(true);
      // Push to recent list (most recent first, deduped, max 3)
      setRecentPatientIds(prev => {
        const updated = [id, ...prev.filter(pid => pid !== id)].slice(0, 3);
        localStorage.setItem('halo_recentPatientIds', JSON.stringify(updated));
        return updated;
      });
    } else {
      sessionStorage.removeItem('halo_selectedPatientId');
    }
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof ApiError) return err.message;
    if (err instanceof Error) return err.message;
    return 'An unexpected error occurred.';
  };

  const refreshPatients = useCallback(async (): Promise<Patient[]> => {
    const data = await fetchAllPatients();
    setPatients(data);
    return data;
  }, []);

  const selectPatientFromDrawer = useCallback(
    (id: string) => {
      selectPatient(id);
      setPatientsDrawerOpen(false);
    },
    [selectPatient]
  );

  useEffect(() => {
    const prev = prevSelectedPatientRef.current;
    prevSelectedPatientRef.current = selectedPatientId;
    if (
      prev !== undefined &&
      prev !== null &&
      selectedPatientId === null &&
      hasOpenedPatient &&
      !isLg
    ) {
      setPatientsDrawerOpen(true);
    }
  }, [selectedPatientId, hasOpenedPatient, isLg]);

  // Check if user has an active session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const auth = await checkAuth();
        if (auth.signedIn) {
          setIsSignedIn(true);
          setUserEmail(auth.email);
          setUserId(auth.user_id);
          setNotesApiAvailable(!!auth.notesApiAvailable);
          const loadedPatients = await refreshPatients();
          // Validate stored patient selection — clear if patient no longer exists
          const storedId = sessionStorage.getItem('halo_selectedPatientId');
          if (storedId && loadedPatients.find(p => p.id === storedId)) {
            persistHasOpenedPatient();
            setHasOpenedPatient(true);
          } else if (storedId && !loadedPatients.find(p => p.id === storedId)) {
            selectPatient(null);
          }
          // Load settings before rendering signed-in UI to avoid profile flicker
          setSettingsLoading(true);
          try {
            const res = await loadSettings();
            if (res.settings) setUserSettings(normalizeUserSettings(res.settings));
          } catch {
            // ignore: app can still render, but we want to stop the loading gate
          } finally {
            setSettingsLoaded(true);
            setSettingsLoading(false);
          }
          // Check for pending scheduler jobs and prompt user if any are due
          getSchedulerStatus().then(status => {
            if (status.totalPending > 0) {
              setSchedulerPrompt({ pending: status.totalPending, due: status.totalDue });
            }
          }).catch(() => {});
        } else {
          setSettingsLoaded(true);
        }
      } catch {
        console.error('Session check failed');
        setSettingsLoaded(true);
      }
      setIsReady(true);
    };
    checkSession();
  }, []);

  const handleSignIn = () => {
    if (loading) return;
    setLoading(true);
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`;
  };

  const handleLogout = async () => {
    await logout();
    setIsSignedIn(false);
    clearHasOpenedPatient();
    setHasOpenedPatient(false);
    selectPatient(null);
  };

  const openCreateModal = () => {
    setLoading(false);
    setShowCreateModal(true);
  };

  const submitCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) return;

    setLoading(true);
    try {
      const newP = await createPatient(newPatientName, newPatientDob, newPatientSex);
      if (newP) {
        await refreshPatients();
        setShowCreateModal(false);
        setNewPatientName("");
        setNewPatientDob("");
        setNewPatientSex("M");
        showToast('Patient folder created successfully.', 'success');
      }
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (settings: UserSettings) => {
    const normalized = normalizeUserSettings(settings);
    await saveSettings(normalized);
    setUserSettings(normalized);
    showToast('Settings saved.', 'success');
  };

  const openSettingsDefault = useCallback(() => {
    setSettingsInitialTab(undefined);
    setSettingsOpenProfileEdit(false);
    setShowSettings(true);
  }, []);

  const openPractitionerProfileSettings = useCallback(() => {
    setSettingsInitialTab('profile');
    setSettingsOpenProfileEdit(true);
    setShowSettings(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
    setSettingsInitialTab(undefined);
    setSettingsOpenProfileEdit(false);
  }, []);

  const handleRunScheduler = async () => {
    setSchedulerRunning(true);
    try {
      await runSchedulerNow();
      showToast('Scheduler ran successfully. Due conversions have been processed.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setSchedulerRunning(false);
      setSchedulerPrompt(null);
    }
  };

  const handleDeleteRequest = (patient: Patient) => {
    setPatientToDelete(patient);
  };

  const confirmDelete = async () => {
    if (!patientToDelete) return;
    setLoading(true);
    try {
      await deletePatient(patientToDelete.id);
      await refreshPatients();
      if (selectedPatientId === patientToDelete.id) selectPatient(null);
      setPatientToDelete(null);
      showToast('Patient folder moved to trash.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isReady) {
    return (
      <>
        <div className="flex min-h-0 flex-1 w-full items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-4">
            <Loader className="animate-spin text-teal-600" size={32} />
            <p className="text-sm text-slate-400 font-medium">Loading HALO...</p>
          </div>
        </div>
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <div className="flex min-h-0 flex-1 w-full items-center justify-center bg-white">
          <div className="max-w-sm w-full px-6 text-center">
            <img
              src="/halo-medical-logo.png"
              alt="HALO Medical"
              className="mx-auto mb-6 h-auto w-48 select-none"
              draggable={false}
            />
            <h1 className="mb-2 text-3xl font-bold text-slate-800">Welcome to HALO</h1>
            <p className="mb-8 leading-relaxed text-slate-500">Sign in to access your Secure Patient Drive.</p>

            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-teal-600 px-6 py-4 text-lg font-semibold text-white shadow-md transition-all hover:bg-teal-700 hover:shadow-lg active:scale-[0.98] disabled:opacity-70"
            >
              {loading ? <Loader className="animate-spin" /> : <LogIn size={20} />}
              {loading ? 'Connecting...' : 'Sign In with Google'}
            </button>

            <p className="mt-8 text-xs text-slate-400">Secure Environment &bull; POPIA Compliant</p>
          </div>
        </div>
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </>
    );
  }

  // Signed-in boot gate: mask initial profile/settings fetch to prevent flicker/layout shift.
  if (!settingsLoaded) {
    return (
      <>
        <style>{`
          @keyframes haloIndeterminate {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(250%); }
          }
        `}</style>
        <div className="relative flex min-h-dvh w-full flex-1 items-center justify-center bg-slate-50">
          <div className="absolute inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-slate-200">
            <div
              className="h-full w-1/3 bg-teal-600"
              style={{ animation: 'haloIndeterminate 1.05s ease-in-out infinite' }}
            />
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 rounded-full border-2 border-slate-200 border-t-teal-600 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700">Preparing your workspace…</p>
              <p className="mt-1 text-xs text-slate-400">
                {settingsLoading ? 'Loading your profile' : 'Just a moment'}
              </p>
            </div>
          </div>
        </div>
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </>
    );
  }

  const activePatient = patients.find(p => p.id === selectedPatientId);
  const admissionsEnabled = userSettings?.modules?.admissions ?? false;
  const showInlineSidebar = mainView !== 'home' || !!selectedPatientId || hasOpenedPatient;
  const showPatientDrawer = patientsDrawerOpen && (!selectedPatientId || !isLg);
  const isFirstHomeLanding = !selectedPatientId && !hasOpenedPatient;

  return (
    <div
      className={`relative flex min-h-0 w-full flex-1 overflow-hidden bg-slate-50 font-sans text-slate-900 min-h-dvh ${
        isFirstHomeLanding ? 'flex-col' : 'flex-row'
      }`}
    >
      <div
        className={`${
          showInlineSidebar ? 'hidden lg:flex' : 'hidden'
        } z-20 h-auto min-h-0 shrink-0 md:h-full`}
      >
        <Sidebar
          patients={patients}
          selectedPatientId={selectedPatientId}
          recentPatientIds={recentPatientIds}
          onSelectPatient={selectPatient}
          onCreatePatient={openCreateModal}
          onDeletePatient={handleDeleteRequest}
          onLogout={handleLogout}
          onOpenSettings={openSettingsDefault}
          onOpenCalendar={() => setMainView('calendar')}
          onOpenAdmissions={() => {
            if (admissionsEnabled) setMainView('admissions');
          }}
          showAdmissionsAction={admissionsEnabled}
          userEmail={userEmail}
          userSettings={userSettings}
        />
      </div>

      {showPatientDrawer && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-900/50"
            aria-label="Close patient list"
            onClick={() => setPatientsDrawerOpen(false)}
          />
          <div
            className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] shrink-0 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="halo-patients-drawer-title"
          >
            <span id="halo-patients-drawer-title" className="sr-only">
              Patient list
            </span>
            <Sidebar
              patients={patients}
              selectedPatientId={selectedPatientId}
              recentPatientIds={recentPatientIds}
              onSelectPatient={selectPatientFromDrawer}
              onCreatePatient={() => {
                setPatientsDrawerOpen(false);
                openCreateModal();
              }}
              onDeletePatient={(p) => {
                handleDeleteRequest(p);
                setPatientsDrawerOpen(false);
              }}
              onLogout={handleLogout}
              onOpenSettings={() => {
                setPatientsDrawerOpen(false);
                openSettingsDefault();
              }}
              onOpenCalendar={() => {
                setPatientsDrawerOpen(false);
                setMainView('calendar');
              }}
              onOpenAdmissions={() => {
                setPatientsDrawerOpen(false);
                if (admissionsEnabled) setMainView('admissions');
              }}
              showAdmissionsAction={admissionsEnabled}
              userEmail={userEmail}
              userSettings={userSettings}
            />
          </div>
        </>
      )}

      <div className="relative flex min-h-0 min-h-[50vh] flex-1 flex-col overflow-hidden min-w-0 md:min-h-0">
        {mainView === 'calendar' ? (
          <Suspense
            fallback={
              <div className="flex min-h-0 flex-1 w-full items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                  <Loader className="animate-spin text-teal-600" size={32} />
                  <p className="text-sm text-slate-400 font-medium">Loading calendar...</p>
                </div>
              </div>
            }
          >
            <CalendarPage
              patients={patients}
              onClose={() => setMainView('home')}
              onSelectPatientFromEvent={(event) => {
                if (event.patientId) {
                  selectPatient(event.patientId);
                }
              }}
            />
          </Suspense>
        ) : mainView === 'admissions' && admissionsEnabled ? (
          <Suspense
            fallback={
              <div className="flex min-h-0 flex-1 w-full items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                  <Loader className="animate-spin text-teal-600" size={32} />
                  <p className="text-sm text-slate-400 font-medium">Loading admissions...</p>
                </div>
              </div>
            }
          >
            <AdmissionsPage
              patients={patients}
              onToast={showToast}
              onClose={() => setMainView('home')}
              onOpenPatient={(patientId) => {
                selectPatient(patientId);
              }}
            />
          </Suspense>
        ) : activePatient ? (
          <PatientWorkspace
            patient={activePatient}
            onBack={() => selectPatient(null)}
            onOpenPatientsList={() => setPatientsDrawerOpen(true)}
            onDataChange={refreshPatients}
            onToast={showToast}
            customTemplate={userSettings?.noteTemplate === 'custom' ? userSettings.customTemplateContent : undefined}
            userId={userId}
            notesApiAvailable={notesApiAvailable}
            showScoringInBottomNav={userSettings?.showScoringInBottomNav !== false}
          />
        ) : (
          <div
            className={`relative flex flex-1 flex-col overflow-y-auto bg-white ${
              isFirstHomeLanding ? 'min-h-dvh' : 'min-h-[60vh] lg:min-h-0'
            }`}
          >
            <img
                src="/halo-logo.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[40%] w-[min(85vw,36rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.04]"
              draggable={false}
            />
            <div
              className={`relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12 text-center ${
                isFirstHomeLanding ? 'min-h-dvh' : ''
              }`}
            >
              <img
                src="/halo-medical-logo.png"
                alt="HALO Medical"
                className="mx-auto mb-8 h-auto w-44 max-w-[min(100%,12rem)] select-none drop-shadow-sm md:w-52"
                draggable={false}
              />
              {isPractitionerProfileComplete(userSettings) ? (
                <>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                    Welcome
                      {userSettings?.firstName?.trim()
                        ? `, ${[userSettings.firstName.trim(), userSettings.lastName?.trim()].filter(Boolean).join(' ')}`
                        : ''}
                    </h1>
                    {(userSettings?.profession?.trim() || userSettings?.department?.trim()) && (
                      <p className="mt-2 text-sm font-medium text-slate-600">
                        {[userSettings?.profession?.trim(), userSettings?.department?.trim()].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-slate-500">
                      {hasOpenedPatient
                        ? 'Select a patient from the list to open their workspace and files.'
                        : 'Open your patient panel to choose someone and jump into their workspace.'}
                    </p>
                    {(!hasOpenedPatient || !isLg) && (
                      <button
                        type="button"
                        onClick={() => setPatientsDrawerOpen(true)}
                        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition hover:bg-teal-500 active:scale-[0.98]"
                      >
                        <PanelLeft className="h-5 w-5 opacity-95" aria-hidden />
                        Open patient panel
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                      Welcome to HALO
                    </h1>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-500">
                      Add your practitioner profile (name, profession, and department) so your workspace can greet you by name and tailor clinical tools.
                    </p>
                    <button
                      type="button"
                      onClick={openPractitionerProfileSettings}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
                    >
                      <User className="h-4 w-4 opacity-90" aria-hidden />
                      Practitioner profile
                    </button>
                    {(!hasOpenedPatient || !isLg) && (
                      <button
                        type="button"
                        onClick={() => setPatientsDrawerOpen(true)}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition hover:bg-teal-500 active:scale-[0.98]"
                      >
                        <Users className="h-5 w-5 opacity-95" aria-hidden />
                        Open patient panel
                      </button>
                    )}
                    <p className="mt-8 text-xs text-slate-400">
                      {hasOpenedPatient
                        ? 'Then choose a patient from the list to begin.'
                        : 'Then open the patient panel to begin.'}
                    </p>
                  </>
                )}
              </div>
            </div>
        )}
      </div>

      {/* TOAST NOTIFICATIONS */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* SETTINGS MODAL */}
      <SettingsModal
        isOpen={showSettings}
        onClose={closeSettings}
        settings={userSettings}
        onSave={handleSaveSettings}
        userEmail={userEmail}
        userId={userId}
        notesApiAvailable={notesApiAvailable}
        loginTime={loginTime}
        initialTab={settingsInitialTab}
        openProfileInEditMode={settingsOpenProfileEdit}
      />

      {/* CREATE PATIENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 m-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><UserPlus className="text-teal-600" size={24}/> New Patient Folder</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <form onSubmit={submitCreatePatient}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-1.5">Full Name</label>
                  <input autoFocus type="text" placeholder="e.g. Sarah Connor" value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Calendar size={14} /> Date of Birth</label>
                    <input type="date" value={newPatientDob} onChange={(e) => setNewPatientDob(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition" />
                  </div>
                  <div className="w-1/3">
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5 flex items-center gap-1"><Users size={14} /> Sex</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button type="button" onClick={() => setNewPatientSex('M')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newPatientSex === 'M' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>M</button>
                      <button type="button" onClick={() => setNewPatientSex('F')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${newPatientSex === 'F' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>F</button>
                    </div>
                  </div>
                </div>
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                  <button type="submit" disabled={!newPatientName.trim() || loading} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 disabled:opacity-50 disabled:shadow-none transition flex items-center justify-center gap-2">
                    {loading ? <Loader className="animate-spin" size={18}/> : 'Create Folder'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULER PROMPT MODAL */}
      {schedulerPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 m-4 border-2 border-amber-100">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mb-3 text-amber-500">
                <Clock size={28} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Pending Conversions</h3>
              <p className="text-slate-500 mt-2 text-sm px-4">
                There {schedulerPrompt.pending === 1 ? 'is' : 'are'} <span className="font-bold text-slate-700">{schedulerPrompt.pending}</span> pending conversion job{schedulerPrompt.pending !== 1 ? 's' : ''} waiting to be processed.
                {schedulerPrompt.due > 0 && (
                  <span className="block mt-1 text-amber-600 font-semibold">
                    {schedulerPrompt.due} {schedulerPrompt.due === 1 ? 'is' : 'are'} ready to run now.
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSchedulerPrompt(null)}
                className="flex-1 px-4 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Later
              </button>
              <button
                onClick={handleRunScheduler}
                disabled={schedulerRunning}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-teal-600/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {schedulerRunning ? <Loader className="animate-spin" size={18} /> : <Play size={18} />}
                {schedulerRunning ? 'Running...' : 'Run Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {patientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 m-4 border-2 border-rose-100">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4 text-rose-500">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Delete Patient Folder?</h2>
              <p className="text-slate-500 mt-2 px-4">
                Are you sure you want to delete <span className="font-bold text-slate-800">{patientToDelete.name}</span>?
                This will move the folder to your Google Drive Trash.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPatientToDelete(null)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-4 py-3 rounded-xl font-bold shadow-lg shadow-rose-500/20 transition flex items-center justify-center gap-2">
                {loading ? <Loader className="animate-spin" size={18}/> : <Trash2 size={18}/>}
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
