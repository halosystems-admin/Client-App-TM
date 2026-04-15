import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { AdmissionsBoard, AdmissionsCard, Patient, AdmissionsViewMode, TriageColor } from '../../../../shared/types';
import { ApiError, fetchAdmissionsBoard, saveAdmissionsBoard } from '../../services/api';
import { Loader2, Plus } from 'lucide-react';
import { AdmissionsAddPatientModal } from './AdmissionsAddPatientModal';
import { AdmissionsBoardHeader } from './AdmissionsBoardHeader';
import { AdmissionsCardDrawer } from './AdmissionsCardDrawer';
import { AdmissionsColumn } from './AdmissionsColumn';
import { AdmissionsPatientCardPreview } from './AdmissionsPatientCard';
import TodayView from './TodayView';
import MoveToModal from './MoveToModal';
import TriageColorPicker from './TriageColorPicker';
import AdmissionsSettingsModal from './AdmissionsSettingsModal';
import AdmissionsConflictDialog from './AdmissionsConflictDialog';
import {
  type BoardFilterMode,
  type CardDrawerState,
  buildVisibleBoard,
  cloneBoard,
  findCardLocation,
  getCardsForView,
  formatDateTimeShort,
} from './admissionsUtils';

interface Props {
  patients: Patient[];
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onClose: () => void;
  onOpenPatient: (
    patientId: string,
    options?: { tab?: 'overview' | 'notes' | 'chat' | 'sessions'; freshSession?: boolean }
  ) => void;
}

export const AdmissionsPage: React.FC<Props> = ({ patients, onToast, onClose, onOpenPatient }) => {
  const [board, setBoard] = useState<AdmissionsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [boardSearch, setBoardSearch] = useState('');
  const [filterMode, setFilterMode] = useState<BoardFilterMode>('all');
  const [now, setNow] = useState(Date.now());
  const [renamingColumnId, setRenamingColumnId] = useState<string | null>(null);
  const [renameColumnValue, setRenameColumnValue] = useState('');
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [newCardColumnId, setNewCardColumnId] = useState<string | null>(null);
  const [newCardPatientId, setNewCardPatientId] = useState('');
  const [newCardSearch, setNewCardSearch] = useState('');
  const [newCardDiagnosis, setNewCardDiagnosis] = useState('');
  const [newCardDoctorsInput, setNewCardDoctorsInput] = useState('');
  const [newCardTagsInput, setNewCardTagsInput] = useState('');
  const [newWardTitle, setNewWardTitle] = useState('');
  const [drawerState, setDrawerState] = useState<CardDrawerState | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<AdmissionsCard | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [doctorInput, setDoctorInput] = useState('');
  const [activeDragCard, setActiveDragCard] = useState<AdmissionsCard | null>(null);
  // Pass 1 state
  const [currentView, setCurrentView] = useState<AdmissionsViewMode>('board');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMoveToModal, setShowMoveToModal] = useState(false);
  const [moveToCardId, setMoveToCardId] = useState<string | null>(null);
  const [showTriageColorPicker, setShowTriageColorPicker] = useState(false);
  const [triageColorCardId, setTriageColorCardId] = useState<string | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [localBoardVersion, setLocalBoardVersion] = useState<number>(0);
  const [loadingMessage, setLoadingMessage] = useState('Loading admissions board...');
  const [loadingProgress, setLoadingProgress] = useState(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const patientsById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients]
  );

  const patientIdNumberLookup = useCallback(
    (patientId: string) => patientsById.get(patientId)?.idNumber,
    [patientsById]
  );

  const filteredPatientResults = useMemo(() => {
    const query = newCardSearch.trim().toLowerCase();
    const existingIds = new Set(
      board?.columns.flatMap((column) => column.cards.map((card) => card.patientId)) || []
    );
    return patients
      .filter((patient) => !existingIds.has(patient.id))
      .filter((patient) => {
        if (!query) return true;
        return (
          patient.name.toLowerCase().includes(query) ||
          patient.dob.toLowerCase().includes(query) ||
          (patient.folderNumber || '').toLowerCase().includes(query) ||
          (patient.idNumber || '').toLowerCase().includes(query)
        );
      })
      .slice(0, 12);
  }, [board?.columns, newCardSearch, patients]);

  const visibleBoard = useMemo(() => {
    if (!board) return null;
    return buildVisibleBoard(board, boardSearch, filterMode, patientIdNumberLookup);
  }, [board, boardSearch, filterMode, patientIdNumberLookup]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadingProgress(0);
    
    // Simulate loading stages
    const progressInterval = window.setInterval(() => {
      setLoadingProgress((p) => Math.min(p + Math.random() * 30, 85));
    }, 200);

    setLoadingMessage('Loading admissions board...');
    
    fetchAdmissionsBoard()
      .then((response) => {
        if (mounted) {
          setBoard(response.board);
          setLocalBoardVersion(response.board.version);
          setLoadingProgress(100);
          setLoadingMessage('Ready');
        }
      })
      .catch((error) => {
        if (mounted) {
          onToast(error instanceof Error ? error.message : 'Failed to load admissions board.', 'error');
          setLoading(false);
        }
      })
      .finally(() => {
        if (mounted) {
          window.clearInterval(progressInterval);
          setTimeout(() => {
            if (mounted) setLoading(false);
          }, 300);
        }
      });
    
    return () => {
      mounted = false;
      window.clearInterval(progressInterval);
    };
  }, [onToast]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const openCardDrawer = (columnId: string, cardId: string) => {
    const column = board?.columns.find((item) => item.id === columnId);
    const card = column?.cards.find((item) => item.id === cardId);
    if (!card) return;
    setDrawerState({ columnId, cardId });
    setDrawerDraft({
      ...card,
      coManagingDoctors: [...card.coManagingDoctors],
      tags: [...card.tags],
      tasks: card.tasks.map((task) => ({ ...task })),
      movementHistory: card.movementHistory.map((movement) => ({ ...movement })),
    });
    setTaskInput('');
    setTagInput('');
    setDoctorInput('');
  };

  const closeDrawer = () => {
    setDrawerState(null);
    setDrawerDraft(null);
    setTaskInput('');
    setTagInput('');
    setDoctorInput('');
  };

  const persistBoard = async (nextBoard: AdmissionsBoard) => {
    setBoard(nextBoard);
    setLocalBoardVersion(nextBoard.version);
    setSaving(true);
    try {
      const response = await saveAdmissionsBoard(nextBoard);
      setBoard(response.board);
      setLocalBoardVersion(response.board.version);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Show conflict dialog (Option B: prompt user)
        setConflictDialogOpen(true);
      } else {
        onToast(error instanceof Error ? error.message : 'Failed to save admissions board.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConflictKeepLocal = () => {
    setConflictDialogOpen(false);
    // User keeps their edits; board is already set to their version
    onToast('Your edits remain local. You can retry saving.', 'info');
  };

  const handleConflictReloadLatest = async () => {
    setConflictDialogOpen(false);
    try {
      const latest = await fetchAdmissionsBoard();
      setBoard(latest.board);
      setLocalBoardVersion(latest.board.version);
      closeDrawer();
      onToast('Reloaded the latest admissions board.', 'info');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Failed to reload board.', 'error');
    }
  };

  const handleTriageColorChange = async (cardId: string, color: TriageColor) => {
    if (!board) return;
    const nextBoard = cloneBoard(board);
    for (const column of nextBoard.columns) {
      const card = column.cards.find((c) => c.id === cardId);
      if (card) {
        card.triageColor = color;
        card.updatedAt = new Date().toISOString();
        break;
      }
    }
    await persistBoard(nextBoard);
    setShowTriageColorPicker(false);
  };

  const handleMoveToWard = async (targetColumnId: string) => {
    if (!board || !moveToCardId) return;
    const nextBoard = cloneBoard(board);
    const nowIso = new Date().toISOString();
    
    let movedCard: AdmissionsCard | null = null;
    let sourceColumnIndex = -1;

    for (let i = 0; i < nextBoard.columns.length; i++) {
      const cardIndex = nextBoard.columns[i].cards.findIndex((c) => c.id === moveToCardId);
      if (cardIndex >= 0) {
        [movedCard] = nextBoard.columns[i].cards.splice(cardIndex, 1);
        sourceColumnIndex = i;
        break;
      }
    }

    if (!movedCard || sourceColumnIndex < 0) return;

    const sourceColumn = nextBoard.columns[sourceColumnIndex];
    const targetColumn = nextBoard.columns.find((c) => c.id === targetColumnId);
    if (!targetColumn) return;

    // Update movement history
    const lastMovement = movedCard.movementHistory[movedCard.movementHistory.length - 1];
    const updatedHistory = lastMovement
      ? [
          ...movedCard.movementHistory.slice(0, -1),
          { ...lastMovement, exitedAt: lastMovement.exitedAt || nowIso },
          {
            columnId: targetColumn.id,
            columnTitle: targetColumn.title,
            enteredAt: nowIso,
          },
        ]
      : [
          {
            columnId: targetColumn.id,
            columnTitle: targetColumn.title,
            enteredAt: nowIso,
          },
        ];

    movedCard.enteredColumnAt = nowIso;
    movedCard.updatedAt = nowIso;
    movedCard.movementHistory = updatedHistory;

    targetColumn.cards.unshift(movedCard);
    await persistBoard(nextBoard);
    setMoveToCardId(null);
  };

  const handleColumnRename = async (columnId: string) => {
    const title = renameColumnValue.trim();
    if (!board || !title) {
      setRenamingColumnId(null);
      setRenameColumnValue('');
      return;
    }
    const nextBoard = cloneBoard(board);
    const column = nextBoard.columns.find((item) => item.id === columnId);
    if (!column) return;
    column.title = title;
    column.cards = column.cards.map((card) => ({
      ...card,
      movementHistory: card.movementHistory.map((movement, index, list) =>
        movement.columnId === columnId && index === list.length - 1
          ? { ...movement, columnTitle: title }
          : movement
      ),
    }));
    setRenamingColumnId(null);
    setRenameColumnValue('');
    await persistBoard(nextBoard);
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!board) return;
    const column = board.columns.find((item) => item.id === columnId);
    if (!column) return;
    if (board.columns.length <= 1) {
      onToast('Keep at least one ward on the board.', 'info');
      return;
    }
    if (column.cards.length > 0) {
      onToast('Move patients out of this ward before deleting it.', 'info');
      return;
    }
    const nextBoard = {
      ...cloneBoard(board),
      columns: board.columns.filter((item) => item.id !== columnId),
    };
    await persistBoard(nextBoard);
  };

  const handleAddWard = async () => {
    if (!board) return;
    const title = newWardTitle.trim();
    if (!title) return;
    const nextBoard = cloneBoard(board);
    nextBoard.columns.push({
      id: crypto.randomUUID(),
      title,
      cards: [],
    });
    setNewWardTitle('');
    await persistBoard(nextBoard);
  };

  const handleOpenAddPatient = (columnId: string) => {
    setNewCardColumnId(columnId);
    setNewCardPatientId('');
    setNewCardSearch('');
    setNewCardDiagnosis('');
    setNewCardDoctorsInput('');
    setNewCardTagsInput('');
    setShowAddPatientModal(true);
  };

  const handleCreateCard = async () => {
    if (!board || !newCardColumnId || !newCardPatientId) return;
    const patient = patientsById.get(newCardPatientId);
    if (!patient) return;
    const targetColumn = board.columns.find((column) => column.id === newCardColumnId);
    if (!targetColumn) return;

    const nowIso = new Date().toISOString();
    const nextBoard = cloneBoard(board);
    const nextColumn = nextBoard.columns.find((column) => column.id === newCardColumnId);
    if (!nextColumn) return;

    nextColumn.cards.unshift({
      id: crypto.randomUUID(),
      patientId: patient.id,
      patientName: patient.name,
      folderNumber: patient.folderNumber,
      diagnosis: newCardDiagnosis.trim(),
      coManagingDoctors: newCardDoctorsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      tags: newCardTagsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      tasks: [],
      enteredColumnAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      movementHistory: [
        {
          columnId: nextColumn.id,
          columnTitle: nextColumn.title,
          enteredAt: nowIso,
        },
      ],
    });

    setShowAddPatientModal(false);
    await persistBoard(nextBoard);
  };

  const saveDrawerDraft = async () => {
    if (!board || !drawerState || !drawerDraft) return;
    const nextBoard = cloneBoard(board);
    const column = nextBoard.columns.find((item) => item.id === drawerState.columnId);
    const cardIndex = column?.cards.findIndex((item) => item.id === drawerState.cardId) ?? -1;
    if (!column || cardIndex < 0) return;
    column.cards[cardIndex] = {
      ...drawerDraft,
      updatedAt: new Date().toISOString(),
    };
    await persistBoard(nextBoard);
    closeDrawer();
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type !== 'card' || !board) {
      setActiveDragCard(null);
      return;
    }
    const loc = findCardLocation(board, String(event.active.id));
    if (!loc) {
      setActiveDragCard(null);
      return;
    }
    const card = board.columns[loc.columnIndex].cards[loc.cardIndex];
    setActiveDragCard(card ? { ...card } : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragCard(null);
    const { active, over } = event;
    if (!board || !over || active.id === over.id) return;

    const activeType = active.data.current?.type as 'column' | 'card' | undefined;
    const overType = over.data.current?.type as 'column' | 'card' | 'columnEmpty' | undefined;
    const nextBoard = cloneBoard(board);

    if (activeType === 'column' && overType === 'column') {
      const oldIndex = nextBoard.columns.findIndex((column) => column.id === String(active.id));
      const newIndex = nextBoard.columns.findIndex((column) => column.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      nextBoard.columns = arrayMove(nextBoard.columns, oldIndex, newIndex);
      await persistBoard(nextBoard);
      return;
    }

    if (activeType !== 'card') return;

    const activeLocation = findCardLocation(nextBoard, String(active.id));
    if (!activeLocation) return;

    const sourceColumn = nextBoard.columns[activeLocation.columnIndex];
    const [movedCard] = sourceColumn.cards.splice(activeLocation.cardIndex, 1);
    if (!movedCard) return;

    let targetColumnIndex = -1;
    let targetCardIndex = 0;

    const restore = () => {
      sourceColumn.cards.splice(activeLocation.cardIndex, 0, movedCard);
    };

    if (overType === 'card') {
      const overLocation = findCardLocation(nextBoard, String(over.id));
      if (!overLocation) {
        restore();
        return;
      }
      targetColumnIndex = overLocation.columnIndex;
      targetCardIndex = overLocation.cardIndex;
    } else if (overType === 'columnEmpty') {
      const cid = over.data.current?.columnId as string | undefined;
      if (!cid) {
        restore();
        return;
      }
      targetColumnIndex = nextBoard.columns.findIndex((column) => column.id === cid);
      if (targetColumnIndex < 0) {
        restore();
        return;
      }
      targetCardIndex = nextBoard.columns[targetColumnIndex].cards.length;
    } else if (overType === 'column') {
      targetColumnIndex = nextBoard.columns.findIndex((column) => column.id === String(over.id));
      if (targetColumnIndex < 0) {
        restore();
        return;
      }
      targetCardIndex = nextBoard.columns[targetColumnIndex].cards.length;
    } else {
      restore();
      return;
    }

    const targetColumn = nextBoard.columns[targetColumnIndex];
    if (!targetColumn) {
      restore();
      return;
    }

    if (sourceColumn.id !== targetColumn.id) {
      const nowIso = new Date().toISOString();
      const lastMovement = movedCard.movementHistory[movedCard.movementHistory.length - 1];
      const updatedHistory = lastMovement
        ? [
            ...movedCard.movementHistory.slice(0, -1),
            { ...lastMovement, exitedAt: lastMovement.exitedAt || nowIso },
            {
              columnId: targetColumn.id,
              columnTitle: targetColumn.title,
              enteredAt: nowIso,
            },
          ]
        : [
            {
              columnId: targetColumn.id,
              columnTitle: targetColumn.title,
              enteredAt: nowIso,
            },
          ];
      movedCard.enteredColumnAt = nowIso;
      movedCard.updatedAt = nowIso;
      movedCard.movementHistory = updatedHistory;
    }

    targetColumn.cards.splice(targetCardIndex, 0, movedCard);
    await persistBoard(nextBoard);
  };

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Top progress bar */}
        <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200 z-50">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-cyan-500 to-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>

        {/* Spinner and message */}
        <div className="flex flex-col items-center gap-6 max-w-md">
          {/* Animated spinner */}
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 border-r-cyan-500 animate-spin" />
          </div>

          {/* Loading text and progress */}
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">{loadingMessage}</p>
            <p className="mt-1.5 text-xs text-slate-400">{Math.floor(loadingProgress)}% complete</p>
          </div>
        </div>
      </div>
    );
  }

  if (!board || !visibleBoard) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-400">
        Unable to load the admissions board.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
      <AdmissionsBoardHeader
        onBack={onClose}
        boardSearch={boardSearch}
        onBoardSearchChange={setBoardSearch}
        filterMode={filterMode}
        onFilterModeChange={setFilterMode}
        saving={saving}
        updatedAt={board.updatedAt}
        currentView={currentView}
        onViewChange={setCurrentView}
        onAddPatient={() => handleOpenAddPatient(board.columns[0]?.id || '')}
        onSettingsClick={() => setShowSettingsModal(true)}
      />

      {/* Render appropriate view based on currentView */}
      {currentView === 'board' ? (
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 py-3 md:px-6 md:py-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={(e: DragEndEvent) => void handleDragEnd(e)}
            onDragCancel={() => setActiveDragCard(null)}
          >
            <SortableContext items={board.columns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex h-full min-w-max snap-x snap-mandatory items-start gap-3 pb-4 md:gap-6">
                {visibleBoard.columns.map((column) => {
                  const originalColumn = board.columns.find((item) => item.id === column.id) || column;
                  return (
                    <AdmissionsColumn
                      key={column.id}
                      column={column}
                      now={now}
                      isRenaming={renamingColumnId === column.id}
                      renameValue={renameColumnValue}
                      onRenameValueChange={setRenameColumnValue}
                      onRenameSubmit={() => void handleColumnRename(column.id)}
                      onStartRename={() => {
                        setRenamingColumnId(column.id);
                        setRenameColumnValue(originalColumn.title);
                      }}
                      onDelete={() => void handleDeleteColumn(column.id)}
                      onAddPatient={() => handleOpenAddPatient(column.id)}
                      onOpenCard={(cardId) => openCardDrawer(column.id, cardId)}
                      onMoveCard={(cardId) => {
                        setMoveToCardId(cardId);
                        setShowMoveToModal(true);
                      }}
                      onTriageColorClick={(cardId) => {
                        setTriageColorCardId(cardId);
                        setShowTriageColorPicker(true);
                      }}
                      patientIdNumberLookup={patientIdNumberLookup}
                    />
                  );
                })}

                <div className="w-[78vw] max-w-[260px] shrink-0 snap-start rounded-xl border-2 border-dashed border-blue-300 bg-gradient-to-br from-blue-50/80 to-blue-50/40 p-4 shadow-sm hover:border-blue-400 hover:from-blue-50 transition-all">
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-blue-700 flex items-center gap-2">
                    <span>➕</span>
                    Add ward
                  </p>
                  <p className="mt-1 text-sm text-blue-600">New unit or stage for inpatients.</p>
                  <input
                    value={newWardTitle}
                    onChange={(event) => setNewWardTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleAddWard();
                    }}
                    placeholder="e.g. HDU"
                    className="mt-3 h-10 w-full rounded-lg border border-blue-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddWard()}
                    disabled={!newWardTitle.trim() || saving}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                  >
                    <Plus className="h-4 w-4" />
                    {saving ? 'Adding...' : 'Add ward'}
                  </button>
                </div>
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeDragCard ? (
                <AdmissionsPatientCardPreview
                  card={activeDragCard}
                  now={now}
                  idNumber={patientIdNumberLookup(activeDragCard.patientId)}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        <TodayView
          cards={getCardsForView(board, currentView)}
          onCardClick={(cardId) => {
            const loc = findCardLocation(board, cardId);
            if (loc) openCardDrawer(board.columns[loc.columnIndex].id, cardId);
          }}
          onMoveToClick={(cardId) => {
            setMoveToCardId(cardId);
            setShowMoveToModal(true);
          }}
          onTriageColorChange={(cardId) => {
            setTriageColorCardId(cardId);
            setShowTriageColorPicker(true);
          }}
          now={now}
        />
      )}

      <AdmissionsAddPatientModal
        open={showAddPatientModal}
        boardColumns={board.columns}
        filteredPatientResults={filteredPatientResults}
        newCardPatientId={newCardPatientId}
        newCardSearch={newCardSearch}
        newCardSearchChange={setNewCardSearch}
        newCardPatientIdChange={setNewCardPatientId}
        newCardColumnId={newCardColumnId}
        newCardColumnIdChange={setNewCardColumnId}
        newCardDiagnosis={newCardDiagnosis}
        newCardDiagnosisChange={setNewCardDiagnosis}
        newCardDoctorsInput={newCardDoctorsInput}
        newCardDoctorsInputChange={setNewCardDoctorsInput}
        newCardTagsInput={newCardTagsInput}
        newCardTagsInputChange={setNewCardTagsInput}
        onClose={() => setShowAddPatientModal(false)}
        onCreateCard={() => void handleCreateCard()}
      />

      {drawerState && drawerDraft && (
        <AdmissionsCardDrawer
          now={now}
          drawerDraft={drawerDraft}
          idNumber={patientIdNumberLookup(drawerDraft.patientId)}
          saving={saving}
          taskInput={taskInput}
          tagInput={tagInput}
          doctorInput={doctorInput}
          onClose={closeDrawer}
          onSave={() => void saveDrawerDraft()}
          setDrawerDraft={setDrawerDraft}
          setTaskInput={setTaskInput}
          setTagInput={setTagInput}
          setDoctorInput={setDoctorInput}
          onOpenPatient={onOpenPatient}
        />
      )}

      <MoveToModal
        isOpen={showMoveToModal}
        onClose={() => {
          setShowMoveToModal(false);
          setMoveToCardId(null);
        }}
        columns={board.columns}
        onMoveCard={handleMoveToWard}
        currentColumnId={
          moveToCardId ? findCardLocation(board, moveToCardId)?.columnIndex.toString() : undefined
        }
      />

      <TriageColorPicker
        isOpen={showTriageColorPicker}
        onClose={() => {
          setShowTriageColorPicker(false);
          setTriageColorCardId(null);
        }}
        currentColor={
          triageColorCardId
            ? board.columns
                .flatMap((col) => col.cards)
                .find((card) => card.id === triageColorCardId)?.triageColor
            : undefined
        }
        onColorSelect={(color) => {
          if (triageColorCardId) void handleTriageColorChange(triageColorCardId, color);
        }}
      />

      <AdmissionsSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        defaultView={currentView}
        onDefaultViewChange={(view) => {
          setCurrentView(view);
          setShowSettingsModal(false);
        }}
      />

      <AdmissionsConflictDialog
        isOpen={conflictDialogOpen}
        onKeepLocal={handleConflictKeepLocal}
        onReloadLatest={handleConflictReloadLatest}
      />
    </div>
  );
};
