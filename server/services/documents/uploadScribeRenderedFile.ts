import { randomUUID } from 'crypto';
import { getOrCreatePatientNotesFolder, getOrCreateChildFolder, uploadToDrive } from '../drive';

export type UploadScribeRenderedInput = {
  accessToken: string | null;
  /** Patient root folder id in Drive (same contract as Halo patient routes). */
  patientFolderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  /** When set, file is saved under Patient Notes / {templateFolderName} / */
  templateFolderName?: string | null;
  /** When true, skip real Drive multipart upload (local/CI). */
  useMockUpload?: boolean;
};

export type UploadScribeRenderedResult = {
  driveFileId: string;
  driveViewUrl: string;
  fileName: string;
};

/**
 * Uploads rendered bytes to the patient's Patient Notes folder.
 * HALO_MOCK_DRIVE_UPLOAD=1 skips real Drive (local / CI only).
 */
export async function uploadScribeRenderedFile(input: UploadScribeRenderedInput): Promise<UploadScribeRenderedResult> {
  if (input.useMockUpload || process.env.HALO_MOCK_DRIVE_UPLOAD === '1') {
    const id = `mock-${randomUUID()}`;
    console.log('[uploadScribeRenderedFile] mock upload ok', {
      patientFolderId: input.patientFolderId,
      fileName: input.fileName,
    });
    return {
      driveFileId: id,
      driveViewUrl: `https://drive.google.com/file/d/${id}/view`,
      fileName: input.fileName,
    };
  }

  if (!input.accessToken) {
    throw new Error(
      'Drive upload requires DOCUMENT_SYNC_GOOGLE_REFRESH_TOKEN or set HALO_MOCK_DRIVE_UPLOAD=1 for local tests.'
    );
  }

  console.log('[uploadScribeRenderedFile] Drive upload start', {
    patientFolderId: input.patientFolderId,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });

  const patientNotesFolderId = await getOrCreatePatientNotesFolder(input.accessToken, input.patientFolderId);
  const templateFolder = (input.templateFolderName || '').trim();
  const parentFolderId = templateFolder
    ? await getOrCreateChildFolder(input.accessToken, patientNotesFolderId, templateFolder)
    : patientNotesFolderId;

  const driveFileId = await uploadToDrive(
    input.accessToken,
    input.fileName,
    input.mimeType,
    parentFolderId,
    input.buffer,
    {
      haloSource: 'scribe_document_sync',
      scribeGenerated: 'true',
    }
  );

  console.log('[uploadScribeRenderedFile] Drive upload ok', {
    patientFolderId: input.patientFolderId,
    fileName: input.fileName,
    driveFileId,
  });

  return {
    driveFileId,
    driveViewUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
    fileName: input.fileName,
  };
}
