import type { AdmissionsBoard, AdmissionsCard, AdmissionsViewMode } from '../../../../shared/types';

export type BoardFilterMode = 'all' | 'openTasks' | 'discharge' | 'critical';

export interface CardDrawerState {
  columnId: string;
  cardId: string;
}

export function formatTimeInStage(enteredAt: string, now: number): string {
  const diffMs = Math.max(0, now - new Date(enteredAt).getTime());
  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function findCardLocation(
  board: AdmissionsBoard,
  cardId: string
): { columnIndex: number; cardIndex: number } | null {
  for (let columnIndex = 0; columnIndex < board.columns.length; columnIndex += 1) {
    const cardIndex = board.columns[columnIndex].cards.findIndex((card) => card.id === cardId);
    if (cardIndex >= 0) return { columnIndex, cardIndex };
  }
  return null;
}

export function cloneBoard(board: AdmissionsBoard): AdmissionsBoard {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({
        ...card,
        coManagingDoctors: [...card.coManagingDoctors],
        tags: [...card.tags],
        tasks: card.tasks.map((task) => ({ ...task })),
        movementHistory: card.movementHistory.map((movement) => ({ ...movement })),
      })),
    })),
  };
}

function cardMatchesFilter(card: AdmissionsCard, mode: BoardFilterMode): boolean {
  if (mode === 'all') return true;
  if (mode === 'openTasks') return card.tasks.some((t) => !t.done);
  if (mode === 'discharge') {
    return card.tags.some((t) => t.toLowerCase().includes('discharge'));
  }
  if (mode === 'critical') {
    return card.tags.some((t) => {
      const x = t.toLowerCase();
      return x === 'critical' || x.includes('critical');
    });
  }
  return true;
}

export function getOpenTaskCount(card: AdmissionsCard): number {
  return card.tasks.filter((task) => !task.done).length;
}

export function getTaskSummary(card: AdmissionsCard): string {
  const openTasks = getOpenTaskCount(card);
  const totalTasks = card.tasks.length;
  if (totalTasks === 0) return 'No tasks';
  return `${openTasks}/${totalTasks} tasks complete`;
}

function getUrgencyRank(card: AdmissionsCard): number {
  const color = (card.triageColor || 'gray').toLowerCase();
  const order: Record<string, number> = {
    red: 0,
    orange: 1,
    yellow: 2,
    green: 3,
    blue: 4,
    gray: 5,
  };
  return order[color] ?? 5;
}

export function sortCardsByPriority(cards: AdmissionsCard[]): AdmissionsCard[] {
  return [...cards].sort((left, right) => {
    const urgencyDiff = getUrgencyRank(left) - getUrgencyRank(right);
    if (urgencyDiff !== 0) return urgencyDiff;

    const leftOpenTasks = getOpenTaskCount(left);
    const rightOpenTasks = getOpenTaskCount(right);
    if (leftOpenTasks !== rightOpenTasks) return rightOpenTasks - leftOpenTasks;

    const leftTaskCount = left.tasks.length;
    const rightTaskCount = right.tasks.length;
    if (leftTaskCount !== rightTaskCount) return rightTaskCount - leftTaskCount;

    return new Date(left.enteredColumnAt).getTime() - new Date(right.enteredColumnAt).getTime();
  });
}

/** Client-side search + ward filter (does not mutate source board). */
export function buildVisibleBoard(
  board: AdmissionsBoard,
  query: string,
  filterMode: BoardFilterMode,
  patientIdNumberLookup: (patientId: string) => string | undefined
): AdmissionsBoard {
  const q = query.trim().toLowerCase();
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.filter((card) => {
        if (!cardMatchesFilter(card, filterMode)) return false;
        if (!q) return true;
        const idNum = patientIdNumberLookup(card.patientId) || '';
        const haystack = [
          card.patientName,
          card.folderNumber || '',
          idNum,
          card.diagnosis,
          ...card.tags,
          ...card.coManagingDoctors,
          ...card.tasks.map((task) => task.title),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      }),
    })),
  };
}

/** View mode-specific grouping for Today view */
export interface TodayViewGroup {
  title: string;
  cards: AdmissionsCard[];
}

export function groupCardsForTodayView(board: AdmissionsBoard, now: number): TodayViewGroup[] {
  const allCards = board.columns.flatMap((col) => col.cards);

  // Group by urgency
  const urgent: AdmissionsCard[] = [];
  const openTasks: AdmissionsCard[] = [];
  const dueLater: AdmissionsCard[] = [];
  const complete: AdmissionsCard[] = [];

  for (const card of allCards) {
    if (card.tags.some((t) => t.toLowerCase().includes('critical'))) {
      urgent.push(card);
    } else if (card.tasks.some((t) => !t.done)) {
      openTasks.push(card);
    } else {
      const stageHours = (now - new Date(card.enteredColumnAt).getTime()) / (1000 * 60 * 60);
      if (stageHours < 24) {
        dueLater.push(card);
      } else {
        complete.push(card);
      }
    }
  }

  const groups: TodayViewGroup[] = [];
  if (urgent.length > 0) groups.push({ title: '🔴 Urgent', cards: urgent });
  if (openTasks.length > 0) groups.push({ title: '📋 Open Tasks', cards: openTasks });
  if (dueLater.length > 0) groups.push({ title: '⏰ Due Today', cards: dueLater });
  if (complete.length > 0) groups.push({ title: '✅ Complete', cards: complete });

  return groups;
}

export function getCardsForView(
  board: AdmissionsBoard,
  mode: AdmissionsViewMode
): AdmissionsCard[] {
  const allCards = board.columns.flatMap((col) => col.cards);
  
  if (mode === 'today') {
    // All active cards (with open tasks or recent)
    return allCards.filter((c) => c.tasks.some((t) => !t.done) || !c.tags.some((t) => t.toLowerCase() === 'discharge'));
  }
  if (mode === 'critical') {
    return allCards.filter((c) => c.tags.some((t) => t.toLowerCase().includes('critical')));
  }
  if (mode === 'discharge') {
    return allCards.filter((c) => c.tags.some((t) => t.toLowerCase().includes('discharge')));
  }
  // board mode - return empty, use board view
  return [];
}

export function formatDateTimeShort(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
