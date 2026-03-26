import React, { useState, useEffect, useRef } from 'react';
import type { Patient, UserSettings } from '../../../shared/types';
import { Plus, LogOut, Search, Trash2, ChevronRight, Users, Clock, Settings, Loader2, Calendar, MoreHorizontal } from 'lucide-react';
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
        className={`group relative flex items-center justify-between gap-1 p-2 rounded-xl cursor-pointer transition-all border border-transparent mb-1 ${
          selectedPatientId === patient.id
            ? 'bg-teal-600/10 border-teal-500/30 text-teal-400 shadow-sm'
            : 'hover:bg-slate-800 hover:border-slate-700/50 hover:text-slate-100'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectPatient(patient.id)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
        >
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            selectedPatientId === patient.id ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white'
          }`}>
            {patient.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{patient.name}</p>
            <p className="truncate text-xs opacity-60">{patient.dob} • {patient.sex}</p>
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
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
              title="Patient actions"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Close menu"
                  onClick={() => setRowMenuPatientId(null)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-slate-700 bg-slate-800 py-1 shadow-xl">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRowMenuPatientId(null);
                      onDeletePatient(patient);
                    }}
                  >
                    <Trash2 size={16} className="shrink-0" />
                    Delete folder
                  </button>
                </div>
              </>
            )}
          </div>
          <ChevronRight
            size={18}
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
    <div className="w-80 md:w-72 lg:w-80 bg-slate-900 h-full min-h-0 flex flex-col text-slate-300 border-r border-slate-800 shadow-2xl">
      <div className="p-6 pt-safe">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-teal-900/20">
              <img src="/halo-icon.png" alt="HALO" className="w-full h-full object-cover" draggable={false} />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg tracking-tight">HALO</h1>
              <p className="text-xs text-teal-500 font-bold tracking-wider">PATIENT DRIVE</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-800 hover:text-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
            title="Settings & Profile"
          >
            <Settings size={20} />
          </button>
        </div>
        <button
          onClick={onOpenCalendar}
          className="w-full mb-4 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all border border-slate-700/60"
          title="Open Calendar"
        >
          <Calendar size={18} className="text-teal-400 shrink-0" />
          <span>Calendar</span>
        </button>
        <div className="relative group">
          <Search className="absolute left-3 top-3 text-slate-500 group-focus-within:text-teal-400 transition-colors" size={18} />
          <input
            type="text"
            placeholder="Search name, DOB, or condition..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/50 focus:bg-slate-800 text-sm pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/50 border border-transparent focus:border-teal-500/30 transition-all placeholder:text-slate-600"
          />
        </div>
        {isAiSearching && searchTerm.length >= 3 && (
          <div className="flex items-center gap-2 mt-2 px-1">
            <Loader2 size={12} className="text-teal-500 animate-spin" />
            <span className="text-[10px] text-teal-500 font-medium uppercase tracking-wider">Scanning patient records...</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 custom-scrollbar">
        {!searchTerm && patients.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 px-2 mb-2">
              <Clock size={12} className="text-teal-500"/>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent Activity</h3>
            </div>
            {recentPatients.map(p => renderPatientRow(p, 'recent'))}
            <div className="my-4 border-t border-slate-800/50 mx-2"></div>
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 px-2 mb-2">
            <Users size={12} className={searchTerm ? "text-teal-500" : "text-slate-500"}/>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {searchTerm ? 'Search Results' : 'All Patients'}
              <span className="ml-1 opacity-60">({filteredPatients.length})</span>
            </h3>
          </div>
          {filteredPatients.length === 0 ? (
            <div className="text-center py-8 opacity-40"><p className="text-sm">No patients found</p></div>
          ) : (
            filteredPatients.map(p => renderPatientRow(p, 'all'))
          )}
        </div>
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm z-10 pb-safe">
        <button
          type="button"
          onClick={onCreatePatient}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 p-3.5 font-bold text-white shadow-lg shadow-teal-900/20 transition-all hover:bg-teal-500 active:scale-[0.98]"
        >
          <Plus size={20} /> New Patient Folder
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
        >
          <LogOut size={14} /> SIGN OUT
        </button>
      </div>
    </div>
  );
};