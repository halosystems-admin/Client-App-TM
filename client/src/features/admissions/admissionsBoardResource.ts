import type { AdmissionsBoard } from '../../../../shared/types';
import { fetchAdmissionsBoard } from '../../services/api';

type AdmissionsBoardLoadState =
  | { status: 'idle' }
  | { status: 'pending'; promise: Promise<void> }
  | { status: 'resolved'; board: AdmissionsBoard }
  | { status: 'rejected'; error: Error };

let state: AdmissionsBoardLoadState = { status: 'idle' };

function cloneBoardForCache(board: AdmissionsBoard): AdmissionsBoard {
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

function loadAdmissionsBoard(): Promise<void> {
  if (state.status === 'pending') {
    return state.promise;
  }

  const promise = fetchAdmissionsBoard()
    .then((response) => {
      state = { status: 'resolved', board: response.board };
    })
    .catch((error) => {
      state = {
        status: 'rejected',
        error: error instanceof Error ? error : new Error('Failed to load admissions board.'),
      };
    });

  state = { status: 'pending', promise };
  return promise;
}

export function readAdmissionsBoard(): AdmissionsBoard {
  if (state.status === 'resolved') {
    return state.board;
  }

  if (state.status === 'rejected') {
    state = { status: 'idle' };
  }

  throw loadAdmissionsBoard();
}

export function primeAdmissionsBoard(board: AdmissionsBoard): void {
  state = {
    status: 'resolved',
    board: cloneBoardForCache(board),
  };
}

export function invalidateAdmissionsBoard(): void {
  state = { status: 'idle' };
}
