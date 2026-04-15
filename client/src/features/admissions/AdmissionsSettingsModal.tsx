import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, GripVertical, Settings, X } from 'lucide-react';
import type { AdmissionsColumn, AdmissionsViewMode } from '../../../../shared/types';

const VIEW_CONFIGS: Record<AdmissionsViewMode, { emoji: string; label: string; color: string; bgColor: string }> = {
  board: { emoji: '📋', label: 'Board View', color: 'text-cyan-600', bgColor: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100' },
  today: { emoji: '📅', label: 'My Tasks', color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200 hover:bg-blue-100' },
  critical: { emoji: '🔴', label: 'Critical View', color: 'text-red-600', bgColor: 'bg-red-50 border-red-200 hover:bg-red-100' },
  discharge: { emoji: '👋', label: 'Discharge View', color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200 hover:bg-amber-100' },
};

interface AdmissionsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultView: AdmissionsViewMode;
  columns: AdmissionsColumn[];
  hiddenColumnIds: string[];
  onSave: (settings: {
    defaultView: AdmissionsViewMode;
    orderedColumnIds: string[];
    hiddenColumnIds: string[];
  }) => void;
}

interface SortableWardRowProps {
  id: string;
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  patientCount: number;
}

function SortableWardRow({
  id,
  title,
  checked,
  onCheckedChange,
  disabled,
  patientCount,
}: SortableWardRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 ${
        isDragging ? 'opacity-70 shadow-md' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 touch-none"
          aria-label={`Reorder ward ${title}`}
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-400">{patientCount} patient{patientCount === 1 ? '' : 's'}</p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${checked ? 'Hide' : 'Show'} ward ${title}`}
        onClick={() => onCheckedChange(!checked)}
        disabled={disabled}
        className={`inline-flex h-6 min-w-[44px] items-center rounded-full border px-1 transition ${
          checked
            ? 'justify-end border-cyan-400 bg-cyan-500'
            : 'justify-start border-slate-300 bg-slate-200'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
      </button>
    </div>
  );
}

export default function AdmissionsSettingsModal({
  isOpen,
  onClose,
  defaultView,
  columns = [],
  hiddenColumnIds = [],
  onSave,
}: AdmissionsSettingsModalProps) {
  const [tempView, setTempView] = useState<AdmissionsViewMode>(defaultView);
  const [orderedColumnIds, setOrderedColumnIds] = useState<string[]>(() => columns.map((column) => column.id));
  const [tempHiddenColumnIds, setTempHiddenColumnIds] = useState<string[]>(hiddenColumnIds);
  const [showManageWards, setShowManageWards] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } })
  );

  useEffect(() => {
    if (!isOpen) return;
    setTempView(defaultView);
    setTempHiddenColumnIds(hiddenColumnIds);
    setOrderedColumnIds(columns.map((column) => column.id));
    setShowManageWards(false);
  }, [columns, defaultView, hiddenColumnIds, isOpen]);

  const columnById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns]
  );

  const orderedColumns = useMemo(
    () => orderedColumnIds.map((columnId) => columnById.get(columnId)).filter(Boolean) as AdmissionsColumn[],
    [columnById, orderedColumnIds]
  );

  const visibleWardCount = columns.length - tempHiddenColumnIds.length;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrderedColumnIds((current) => {
      const from = current.indexOf(String(active.id));
      const to = current.indexOf(String(over.id));
      if (from < 0 || to < 0) return current;
      return arrayMove(current, from, to);
    });
  };

  const toggleWard = (columnId: string, checked: boolean) => {
    setTempHiddenColumnIds((current) => {
      const currentVisibleWardCount = columns.length - current.length;
      if (checked) {
        return current.filter((id) => id !== columnId);
      }
      if (currentVisibleWardCount <= 1 && !current.includes(columnId)) {
        return current;
      }
      return [...current, columnId];
    });
  };

  const handleSave = () => {
    onSave({
      defaultView: tempView,
      orderedColumnIds,
      hiddenColumnIds: tempHiddenColumnIds,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative mx-4 max-h-[88vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="overflow-y-auto p-6">
          <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-cyan-100 p-2">
                <Settings className="h-5 w-5 text-cyan-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Admissions settings</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
            >
              <X className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          <div className="mb-6 space-y-3">
            <label className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
              <span className="text-cyan-600">⚙️</span>
              Default view
            </label>
            {(['board', 'today', 'critical', 'discharge'] as AdmissionsViewMode[]).map((view) => {
              const config = VIEW_CONFIGS[view];
              return (
                <label
                  key={view}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-all ${
                    tempView === view
                      ? `${config.bgColor} border-current`
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="defaultView"
                    value={view}
                    checked={tempView === view}
                    onChange={() => setTempView(view)}
                    className="h-4 w-4"
                  />
                  <span className="text-lg">{config.emoji}</span>
                  <span className={`text-sm font-semibold capitalize ${tempView === view ? config.color : 'text-slate-900'}`}>
                    {config.label}
                  </span>
                </label>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowManageWards(true)}
            className="mb-6 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-cyan-300 hover:bg-cyan-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🩺</span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Manage Wards</p>
                <p className="mt-1 text-xs text-slate-500">{visibleWardCount} visible of {columns.length} total wards</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-900 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {showManageWards && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/45" onClick={() => setShowManageWards(false)} />
          <div className="relative mx-4 max-h-[88vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="overflow-y-auto p-6">
              <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Manage wards</h3>
                  <p className="mt-1 text-xs text-slate-500">Drag to reorder left to right. Toggle to show or hide wards.</p>
                </div>
                <button
                  onClick={() => setShowManageWards(false)}
                  className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
                >
                  <X className="h-5 w-5 text-slate-600" />
                </button>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedColumnIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2.5">
                    {orderedColumns.map((column) => {
                      const checked = !tempHiddenColumnIds.includes(column.id);
                      const disabled = checked && visibleWardCount <= 1;
                      return (
                        <SortableWardRow
                          key={column.id}
                          id={column.id}
                          title={column.title}
                          checked={checked}
                          disabled={disabled}
                          patientCount={column.cards.length}
                          onCheckedChange={(nextChecked) => toggleWard(column.id, nextChecked)}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
