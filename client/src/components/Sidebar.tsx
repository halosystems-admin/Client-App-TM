import React, { useState, useEffect, useRef } from 'react';
import type { Patient, UserSettings } from '../../../shared/types';
import { Plus, LogOut, Search, Trash2, ChevronRight, Users, Clock, Settings, Loader2, Calendar, MoreHorizontal, LayoutGrid } from 'lucide-react';
import { searchPatientsByConcept } from '../services/api';

interface SidebarProps {
  patients: Patient[];
  selectedPatientId: string | null;
  recentPatientIds: string[];
  onSelectPatient: (id: string) => void;
  onCreatePatient: () => void;
  onDeletePatient: (patient: Patient) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenCalendar: () => void;
  onOpenAdmissions: () => void;
  showAdmissionsAction?: boolean;
  userEmail?: string;
  userSettings?: UserSettings | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  patients,
  selectedPatientId,
  recentPatientIds,
  onSelectPatient,
  onCreatePatient,
  onDeletePatient,
  onLogout,
  onOpenSettings,
  onOpenCalendar,
  onOpenAdmissions,
  showAdmissionsAction = false,
  userEmail,
  userSettings,
}) => {
  const [rowMenuPatientId, setRowMenuPatientId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [aiSearchResults, setAiSearchResults] = useState<string[] | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local filter (instant)
  const localFiltered = patients.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.dob.includes(searchTerm)
  );

  // Trigger AI concept search after debounce when local results are few
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setAiSearchResults(null);

    if (!searchTerm.trim() || searchTerm.length < 3) return;

    // Only trigger AI search if local results are sparse (concept search)
    if (localFiltered.length <= 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        setIsAiSearching(true);
        try {
          const ids = await searchPatientsByConcept(searchTerm, patients, {});
          setAiSearchResults(ids);
        } catch {
          setAiSearchResults(null);
        }
        setIsAiSearching(false);
      }, 600);
    }

    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchTerm, patients]);

  // Merge local + AI results
  const filteredPatients = searchTerm.trim()
    ? patients.filter(p => {
        const localMatch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.dob.includes(searchTerm);
        const aiMatch = aiSearchResults?.includes(p.id) ?? false;
        return localMatch || aiMatch;
      })
    : patients;

  // Show recently opened patients (by tracked IDs), falling back to first 3 if no history
  const recentPatients = recentPatientIds.length > 0
    ? recentPatientIds
        .map(id => patients.find(p => p.id === id))
        .filter((p): p is Patient => !!p)
        .slice(0, 3)
    : patients.slice(0, 3);

  const renderPatientRow = (patient: Patient, keyPrefix: string) => {
    const menuOpen = rowMenuPatientId === patient.id;
    return (
      <div
        key={`${keyPrefix}-${patient.id}`}
        className={`group relative flex items-center justify-between gap-0.5 rounded-lg px-2 py-1.5 cursor-pointer transition-all border border-transparent mb-0.5 ${
          selectedPatientId === patient.id
            ? 'bg-teal-600/10 border-teal-500/30 text-teal-400'
            : 'hover:bg-slate-800 hover:border-slate-700/50 hover:text-slate-100'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectPatient(patient.id)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
        >
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            selectedPatientId === patient.id ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white'
          }`}>
            {patient.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-snug">{patient.name}</p>
            <p className="truncate text-[11px] leading-snug opacity-50">{patient.dob} · {patient.sex}</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRowMenuPatientId(menuOpen ? null : patient.id);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
              title="Patient actions"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setRowMenuPatientId(null)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-slate-700 bg-slate-800 py-0.5 shadow-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-rose-300 hover:bg-rose-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRowMenuPatientId(null);
                      onDeletePatient(patient);
                    }}
                  >
                    <Trash2 size={14} className="shrink-0" />
                    Delete folder
                  </button>
                </div>
              </>
            )}
          </div>
          <ChevronRight
            size={15}
            className={`hidden text-slate-500 sm:block ${
              selectedPatientId === patient.id ? 'opacity-100 text-teal-400' : 'opacity-0 transition-opacity group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100'
            }`}
            aria-hidden
          />
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 md:w-72 lg:w-80 bg-slate-900 h-full min-h-0 flex flex-col overflow-hidden text-slate-300 shadow-2xl ring-1 ring-inset ring-slate-800/70">
      <div className="shrink-0 border-b border-slate-800/80 bg-slate-900/95 px-3 pb-3 pt-3 pt-safe backdrop-blur-sm md:px-4 md:pb-4 md:pt-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-3 md:px-3.5 md:py-3.5">
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="h-8 w-8 overflow-hidden rounded-lg shadow-sm shadow-teal-900/20">
                <img src="/halo-icon.png" alt="HALO" className="h-full w-full object-cover" draggable={false} />
              </div>
              <div>
                <h1 className="text-[15px] font-bold leading-tight tracking-tight text-white">HALO</h1>
                <p className="text-[10px] font-bold tracking-wider text-teal-500">PATIENT DRIVE</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-all hover:bg-slate-800 hover:text-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
              title="Settings & Profile"
            >
              <Settings size={16} />
            </button>
          </div>
          <div className={`mb-3 grid gap-2 ${showAdmissionsAction ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              onClick={onOpenCalendar}
              className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white"
              title="Open Calendar"
            >
              <Calendar size={14} className="shrink-0 text-teal-400" />
              <span>Calendar</span>
            </button>
            {showAdmissionsAction && (
              <button
                onClick={onOpenAdmissions}
                className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700 hover:text-white"
                title="Open Admissions"
              >
                <LayoutGrid size={14} className="shrink-0 text-cyan-300" />
                <span>Admissions</span>
              </button>
            )}
          </div>
          <div className="group relative">
            <Search className="absolute left-3 top-2 text-slate-500 transition-colors group-focus-within:text-teal-400" size={15} />
            <input
              type="text"
              placeholder="Search name, DOB, or condition..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-transparent bg-slate-800/50 py-2 pl-9 pr-3 text-xs outline-none transition-all placeholder:text-slate-600 focus:border-teal-500/30 focus:bg-slate-800 focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
          {isAiSearching && searchTerm.length >= 3 && (
            <div className="mt-2 flex items-center gap-2 px-1">
              <Loader2 size={12} className="animate-spin text-teal-500" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-teal-500">Scanning patient records...</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 custom-scrollbar md:px-4">
        {!searchTerm && patients.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 px-2 mb-1.5">
              <Clock size={10} className="text-teal-500"/>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Recent</h3>
            </div>
            {recentPatients.map(p => renderPatientRow(p, 'recent'))}
            <div className="my-3 border-t border-slate-800/50 mx-2"></div>
          </div>
        )}
        <div>
          <div className="flex items-center gap-1.5 px-2 mb-1.5">
            <Users size={10} className={searchTerm ? "text-teal-500" : "text-slate-500"}/>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {searchTerm ? 'Search Results' : 'All Patients'}
              <span className="ml-1 opacity-60">({filteredPatients.length})</span>
            </h3>
          </div>
          {filteredPatients.length === 0 ? (
            <div className="text-center py-6 opacity-40"><p className="text-xs">No patients found</p></div>
          ) : (
            filteredPatients.map(p => renderPatientRow(p, 'all'))
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-800/80 bg-slate-900/95 px-4 pb-safe pt-4 backdrop-blur-sm md:px-5 md:pt-5">
        <button
          type="button"
          onClick={onCreatePatient}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 text-sm font-semibold text-white shadow-sm shadow-teal-900/20 transition-all hover:bg-teal-500 active:scale-[0.98]"
        >
          <Plus size={16} /> New Patient Folder
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="mb-4 mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white transition-colors hover:bg-rose-700 md:mb-5"
        >
          <LogOut size={12} /> SIGN OUT
        </button>
      </div>
    </div>
  );
};