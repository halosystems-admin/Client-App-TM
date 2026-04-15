import React from 'react';
import type { AdmissionsSettingsData, Patient } from '../../../../shared/types';
import { readAdmissionsBoard } from './admissionsBoardResource';
import { AdmissionsPage } from './AdmissionsPage';

interface Props {
  patients: Patient[];
  focusPatientId?: string | null;
  admissionsSettings?: AdmissionsSettingsData;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onClose: () => void;
  onSaveAdmissionsSettings: (settings: AdmissionsSettingsData) => Promise<void>;
  onOpenPatient: (
    patientId: string,
    options?: { tab?: 'overview' | 'notes' | 'chat' | 'sessions'; freshSession?: boolean }
  ) => void;
}

export const AdmissionsPageLoader: React.FC<Props> = (props) => {
  const board = readAdmissionsBoard();

  return <AdmissionsPage {...props} initialBoard={board} />;
};
