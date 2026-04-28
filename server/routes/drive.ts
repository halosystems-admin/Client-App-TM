import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { config } from '../config';
import {
  driveRequest,
  type DriveFileRaw,
  getHaloRootFolder,
  getOrCreatePatientNotesFolder,
  getOrCreateFolderChain,
  uploadToDrive,
  sanitizeString,
  isValidDate,
  isValidSex,
  parseFolderString,
  parsePatientFolder,
} from '../services/drive';
import { textToDocx } from '../utils/docx';
import { recoverPendingJobs, runSchedulerNow, getSchedulerStatus } from '../jobs/scheduler';
import {
  ensurePatientSummaryUpToDate,
  refreshPatientSummaryInBackground,
} from '../services/patientSummary';
import {
  loadAdmissionsBoard,
  normalizeAdmissionsBoard,
  saveAdmissionsBoard,
} from '../services/admissionsBoard';

const router = Router();
router.use(requireAuth);

const { driveApi, uploadApi } = config;

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const DEFAULT_PAGE_SIZE = 50;

async function listFolderChildren(token: string, folderId: string): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const items: Array<{ id: string; name: string; mimeType: string }> = [];
  let pageToken: string | undefined;

  do {
    let url = `/files?q=${encodeURIComponent(
      `'${folderId}' in parents and trashed=false`
    )}&fields=files(id,name,mimeType),nextPageToken&pageSize=200`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }
    const data = await driveRequest(token, url);
    for (const f of data.files || []) {
      items.push({ id: f.id, name: f.name, mimeType: f.mimeType });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

async function ensureChildFolder(token: string, parentId: string, name: string): Promise<string> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const existing = await driveRequest(token, `/files?q=${q}&fields=files(id)`);
  if (existing.files && existing.files.length > 0) {
    return existing.files[0].id;
  }

  const createRes = await fetch(`${driveApi}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      parents: [parentId],
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => 'Unknown error');
    throw new Error(`[Drive ${createRes.status}] Failed to create folder ${name}: ${errText}`);
  }
  const folder = (await createRes.json()) as { id: string };
  return folder.id;
}

async function moveItem(token: string, itemId: string, fromParentId: string, toParentId: string): Promise<void> {
  const url = `${driveApi}/files/${itemId}?addParents=${encodeURIComponent(toParentId)}&removeParents=${encodeURIComponent(fromParentId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`[Drive ${res.status}] Failed to move item ${itemId}: ${errText}`);
  }
}

async function trashItem(token: string, itemId: string): Promise<void> {
  const res = await fetch(`${driveApi}/files/${itemId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`[Drive ${res.status}] Failed to trash item ${itemId}: ${errText}`);
  }
}

async function countFilesRecursive(token: string, folderId: string): Promise<number> {
  const children = await listFolderChildren(token, folderId);
  let count = 0;
  for (const child of children) {
    if (child.mimeType === FOLDER_MIME_TYPE) {
      count += await countFilesRecursive(token, child.id);
    } else {
      count += 1;
    }
  }
  return count;
}

async function mergeFolderInto(token: string, sourceFolderId: string, targetFolderId: string): Promise<void> {
  const children = await listFolderChildren(token, sourceFolderId);
  for (const child of children) {
    if (child.mimeType === FOLDER_MIME_TYPE) {
      const targetChildFolderId = await ensureChildFolder(token, targetFolderId, child.name);
      await mergeFolderInto(token, child.id, targetChildFolderId);
      await trashItem(token, child.id);
    } else {
      await moveItem(token, child.id, sourceFolderId, targetFolderId);
    }
  }
}

// --- Routes ---

// GET /patients?page=<token>&pageSize=<number>
router.get('/patients', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;

    // On first auth request after restart, recover any pending conversion jobs from Drive
    const refreshToken = req.session.refreshToken || '';
    recoverPendingJobs(token, refreshToken).catch(() => {});

    const rootId = await getHaloRootFolder(token);

    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, 100);
    const pageToken = typeof req.query.page === 'string' ? req.query.page : undefined;

    let url = `/files?q=${encodeURIComponent(
      `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    )}&fields=files(id,name,appProperties,createdTime),nextPageToken&pageSize=${pageSize}`;

    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const data = await driveRequest(token, url);
    const patients = (data.files || []).map(parsePatientFolder);

    console.log(
      'Fetch patients:',
      req.session.userEmail || 'unknown user',
      'rootId',
      rootId,
      'count',
      patients.length
    );

    // Auto-heal: update appProperties if folder name was changed in Drive
    for (const f of data.files || []) {
      if (!f.name.includes('__')) continue;
      const parsed = parseFolderString(f.name);
      if (!parsed) continue;
      const storedName = f.appProperties?.patientName;
      const storedDob = f.appProperties?.patientDob;
      const storedSex = f.appProperties?.patientSex;
      if (parsed.pName !== storedName || parsed.pDob !== storedDob || parsed.pSex !== storedSex) {
        fetch(`${driveApi}/files/${f.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            appProperties: {
              patientName: parsed.pName,
              patientDob: parsed.pDob,
              patientSex: parsed.pSex,
            },
          }),
        }).catch(() => {});
      }
    }

    res.json({ patients, nextPage: data.nextPageToken || null });
  } catch (err) {
    console.error('Fetch patients error:', err);
    res.status(500).json({ error: 'Failed to fetch patients.' });
  }
});

// GET /patients/:id - fetch single patient metadata
router.get('/patients/:id', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const { id } = req.params;

    const file = await driveRequest(token, `/files/${id}?fields=id,name,appProperties,createdTime`);
    if (!file || !file.id) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }

    const rawDriveFile: DriveFileRaw = {
      id: file.id,
      name: file.name || '',
      mimeType: file.mimeType || 'application/vnd.google-apps.folder',
      webViewLink: file.webViewLink,
      appProperties: file.appProperties,
      createdTime: file.createdTime,
    };

    const patient = parsePatientFolder(rawDriveFile);
    res.json(patient);
  } catch (err) {
    console.error('Fetch patient error:', err);
    res.status(500).json({ error: 'Failed to fetch patient.' });
  }
});

// POST /run-scheduler — run conversion jobs immediately (no wait for 5-min interval)
router.post('/run-scheduler', async (_req: Request, res: Response) => {
  try {
    await runSchedulerNow();
    res.json({ ok: true, message: 'Scheduler ran. Due conversions have been processed.' });
  } catch (err) {
    console.error('Run scheduler error:', err);
    res.status(500).json({ error: 'Scheduler run failed.' });
  }
});

// GET /scheduler-status — check pending conversion jobs count
router.get('/scheduler-status', async (_req: Request, res: Response) => {
  try {
    const status = getSchedulerStatus();
    const pendingJobs = status.jobs.filter(j => j.status !== 'done');
    const dueJobs = pendingJobs.filter(j => {
      const elapsed = Date.now() - new Date(j.savedAt).getTime();
      const tenHoursMs = 10 * 60 * 60 * 1000;
      if (j.status === 'pending_docx') return elapsed >= tenHoursMs;
      if (j.status === 'pending_pdf') return elapsed >= tenHoursMs;
      return false;
    });
    res.json({
      totalPending: pendingJobs.length,
      totalDue: dueJobs.length,
      jobs: pendingJobs.map(j => ({
        fileId: j.fileId,
        status: j.status,
        savedAt: j.savedAt,
      })),
    });
  } catch (err) {
    console.error('Scheduler status error:', err);
    res.status(500).json({ error: 'Failed to get scheduler status.' });
  }
});

// POST /patients
router.post('/patients', async (req: Request, res: Response) => {
  try {
    let dob = sanitizeString(req.body.dob);
    
    // Normalize date format from YYYY/MM/DD to YYYY-MM-DD
    if (dob) {
      dob = dob.replace(/\//g, '-');
    }
    
    const name = sanitizeString(req.body.name);
    const sex = sanitizeString(req.body.sex);

    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Patient name must be at least 2 characters.' });
      return;
    }
    if (!dob || !isValidDate(dob)) {
      res.status(400).json({ error: 'Invalid date of birth. Use YYYY/MM/DD format.' });
      return;
    }
    if (!isValidSex(sex)) {
      res.status(400).json({ error: 'Sex must be M or F.' });
      return;
    }

    const token = req.session.accessToken!;
    const rootId = await getHaloRootFolder(token);

    const createRes = await fetch(`${driveApi}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${name}__${dob}__${sex}`,
        parents: [rootId],
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: {
          type: 'patient_folder',
          patientName: name,
          patientDob: dob,
          patientSex: sex,
        },
      }),
    });

    const folder = (await createRes.json()) as { id: string };
    res.json({
      id: folder.id,
      name,
      dob,
      sex,
      lastVisit: new Date().toISOString().split('T')[0],
      alerts: [],
    });
  } catch (err) {
    console.error('Create patient error:', err);
    res.status(500).json({ error: 'Failed to create patient.' });
  }
});

// PATCH /patients/:id
router.patch('/patients/:id', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const { id } = req.params;

    const name = req.body.name ? sanitizeString(req.body.name) : undefined;
    let dob = req.body.dob ? sanitizeString(req.body.dob) : undefined;
    const sex = req.body.sex ? sanitizeString(req.body.sex) : undefined;

    // Normalize date format from YYYY/MM/DD to YYYY-MM-DD
    if (dob) {
      dob = dob.replace(/\//g, '-');
    }

    if (name !== undefined && name.length < 2) {
      res.status(400).json({ error: 'Patient name must be at least 2 characters.' });
      return;
    }
    if (dob !== undefined && !isValidDate(dob)) {
      res.status(400).json({ error: 'Invalid date of birth. Use YYYY/MM/DD format.' });
      return;
    }
    if (sex !== undefined && !isValidSex(sex)) {
      res.status(400).json({ error: 'Sex must be M or F.' });
      return;
    }

    const current = await driveRequest(token, `/files/${id}?fields=name,appProperties`);

    let currentName = current.appProperties?.patientName;
    let currentDob = current.appProperties?.patientDob;
    let currentSex = current.appProperties?.patientSex;

    const needsParsing = !currentName || currentName === 'Unknown' || currentName?.includes('_');
    if (needsParsing && current.name?.includes('__')) {
      const parsed = parseFolderString(current.name);
      if (parsed) {
        currentName = parsed.pName;
        currentDob = parsed.pDob;
        currentSex = parsed.pSex;
      }
    }

    const finalName = name || currentName || 'Unknown';
    const finalDob = dob || currentDob || 'Unknown';
    const finalSex = sex || currentSex || 'M';

    await fetch(`${driveApi}/files/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${finalName}__${finalDob}__${finalSex}`,
        appProperties: {
          patientName: finalName,
          patientDob: finalDob,
          patientSex: finalSex,
        },
      }),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update patient error:', err);
    res.status(500).json({ error: 'Failed to update patient.' });
  }
});

// DELETE /patients/:id
router.delete('/patients/:id', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    await fetch(`${driveApi}/files/${req.params.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete patient error:', err);
    res.status(500).json({ error: 'Failed to delete patient.' });
  }
});

// POST /patients/:id/folder - Create a subfolder
router.post('/patients/:id/folder', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const name = sanitizeString(req.body.name, 255);

    if (!name || name.length < 1) {
      res.status(400).json({ error: 'Folder name is required.' });
      return;
    }

    const createRes = await fetch(`${driveApi}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        parents: [req.params.id],
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    const folder = (await createRes.json()) as { id: string; name: string; mimeType: string; createdTime?: string };
    res.json({
      id: folder.id,
      name: folder.name,
      mimeType: folder.mimeType,
      url: '',
      createdTime: folder.createdTime?.split('T')[0] ?? new Date().toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder.' });
  }
});

// GET /patients/:id/files?page=<token>&pageSize=<number>
router.get('/patients/:id/files', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const pageSize = Math.min(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, 100);
    const pageToken = typeof req.query.page === 'string' ? req.query.page : undefined;

    let url = `/files?q=${encodeURIComponent(
      `'${req.params.id}' in parents and trashed=false`
    )}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,createdTime),nextPageToken&pageSize=${pageSize}`;

    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const data = await driveRequest(token, url);

    const files = (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      url: f.webViewLink ?? '',
      thumbnail: f.thumbnailLink ?? '',
      createdTime: f.createdTime?.split('T')[0] ?? '',
    }));

    res.json({ files, nextPage: data.nextPageToken || null });
  } catch (err) {
    console.error('Fetch files error:', err);
    res.status(500).json({ error: 'Failed to fetch files.' });
  }
});

// POST /patients/:id/upload
router.post('/patients/:id/upload', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const fileName = sanitizeString(req.body.fileName, 255);
    const fileType = sanitizeString(req.body.fileType, 100);
    const fileData = req.body.fileData as string;

    if (!fileName) {
      res.status(400).json({ error: 'File name is required.' });
      return;
    }
    if (!fileType || !ALLOWED_UPLOAD_TYPES.includes(fileType)) {
      res.status(400).json({ error: `File type not allowed. Accepted: ${ALLOWED_UPLOAD_TYPES.join(', ')}` });
      return;
    }
    if (!fileData || typeof fileData !== 'string') {
      res.status(400).json({ error: 'File data is required.' });
      return;
    }

    const estimatedSize = Math.ceil(fileData.length * 3 / 4);
    if (estimatedSize > MAX_FILE_SIZE_BYTES) {
      res.status(400).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.` });
      return;
    }

    const metadata = {
      name: fileName,
      parents: [req.params.id],
      mimeType: fileType,
    };

    const boundary = 'halo_upload_boundary';
    const metaPart = JSON.stringify(metadata);

    const multipartBody = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n` +
      `--${boundary}\r\nContent-Type: ${fileType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
      `${fileData}\r\n` +
      `--${boundary}--`
    );

    const uploadRes = await fetch(
      `${uploadApi}/files?uploadType=multipart`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Drive upload failed:', uploadRes.status, errText);
      res.status(500).json({ error: 'Google Drive upload failed.' });
      return;
    }

    const data = (await uploadRes.json()) as { id: string; name: string; mimeType: string; webViewLink?: string };
    res.json({
      id: data.id,
      name: data.name,
      mimeType: data.mimeType,
      url: data.webViewLink ?? '',
      createdTime: new Date().toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file.' });
  }
});

// PATCH /files/:fileId
router.patch('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const name = sanitizeString(req.body.name, 255);

    if (!name) {
      res.status(400).json({ error: 'File name is required.' });
      return;
    }

    await fetch(`${driveApi}/files/${req.params.fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update file error:', err);
    res.status(500).json({ error: 'Failed to update file.' });
  }
});

// DELETE /files/:fileId - Trash a file
router.delete('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    await fetch(`${driveApi}/files/${req.params.fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file.' });
  }
});

// POST /patients/:id/notes/merge - merge duplicate Patient Notes folders safely
router.post('/patients/:id/notes/merge', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const patientId = req.params.id as string;

    const rootChildren = await listFolderChildren(token, patientId);
    const patientNotesFolders = rootChildren.filter(
      (f) => f.mimeType === FOLDER_MIME_TYPE && f.name === 'Patient Notes'
    );

    if (patientNotesFolders.length <= 1) {
      res.json({ success: true, message: 'No duplicate Patient Notes folders found.', merged: 0 });
      return;
    }

    let canonical = patientNotesFolders[0];
    let canonicalCount = await countFilesRecursive(token, canonical.id);
    for (let i = 1; i < patientNotesFolders.length; i += 1) {
      const candidate = patientNotesFolders[i];
      const candidateCount = await countFilesRecursive(token, candidate.id);
      if (candidateCount > canonicalCount) {
        canonical = candidate;
        canonicalCount = candidateCount;
      }
    }

    const mergedFrom: string[] = [];
    for (const folder of patientNotesFolders) {
      if (folder.id === canonical.id) continue;
      await mergeFolderInto(token, folder.id, canonical.id);
      await trashItem(token, folder.id);
      mergedFrom.push(folder.id);
    }

    res.json({
      success: true,
      canonicalFolderId: canonical.id,
      mergedFrom,
      merged: mergedFrom.length,
    });
  } catch (err) {
    console.error('Merge patient notes folders error:', err);
    res.status(500).json({ error: 'Failed to merge Patient Notes folders.' });
  }
});

// GET /files/:fileId/download - Get download URL
router.get('/files/:fileId/download', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const data = await driveRequest(
      token,
      `/files/${req.params.fileId}?fields=webContentLink,webViewLink,name,mimeType`
    );

    res.json({
      downloadUrl: (data as Record<string, unknown>).webContentLink || '',
      viewUrl: (data as Record<string, unknown>).webViewLink || '',
      name: data.name ?? '',
      mimeType: data.mimeType ?? '',
    });
  } catch (err) {
    console.error('Download file error:', err);
    res.status(500).json({ error: 'Failed to get download link.' });
  }
});

// GET /files/:fileId/proxy — stream file content for in-app viewer
router.get('/files/:fileId/proxy', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const fileId = req.params.fileId;

    // Get file metadata first
    const meta = await driveRequest(token, `/files/${fileId}?fields=name,mimeType`);
    const mimeType = meta.mimeType ?? 'application/octet-stream';
    const name = meta.name ?? 'file';

    let contentResponse: globalThis.Response;

    // Google Workspace files need export, not direct download
    if (mimeType === 'application/vnd.google-apps.document') {
      contentResponse = await fetch(
        `${config.driveApi}/files/${fileId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.setHeader('Content-Type', 'application/pdf');
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      contentResponse = await fetch(
        `${config.driveApi}/files/${fileId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.setHeader('Content-Type', 'application/pdf');
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      contentResponse = await fetch(
        `${config.driveApi}/files/${fileId}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.setHeader('Content-Type', 'application/pdf');
    } else {
      contentResponse = await fetch(
        `${config.driveApi}/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.setHeader('Content-Type', mimeType);
    }

    if (!contentResponse.ok) {
      res.status(contentResponse.status).json({ error: 'Failed to fetch file content.' });
      return;
    }

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);

    const arrayBuffer = await contentResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('File proxy error:', err);
    res.status(500).json({ error: 'Failed to proxy file.' });
  }
});

// POST /patients/:id/note
router.post('/patients/:id/note', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const patientId = req.params.id as string;
    const content = req.body.content as string;
    const fileNameInput = sanitizeString(req.body.fileName, 255);
    const folderPathInput = sanitizeString(req.body.folderPath, 500);

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Note content is required.' });
      return;
    }

    if (content.length > 100_000) {
      res.status(400).json({ error: 'Note content is too long. Maximum 100,000 characters.' });
      return;
    }

    const patientNotesFolderId = await getOrCreatePatientNotesFolder(token, patientId);

    const folderSegments = folderPathInput
      ? folderPathInput
          .split('/')
          .map((segment) => sanitizeString(segment, 255))
          .filter(Boolean)
      : [];
    if (folderSegments[0]?.toLowerCase() === 'patient notes') {
      folderSegments.shift();
    }

    const targetFolderId = folderSegments.length > 0
      ? await getOrCreateFolderChain(token, patientNotesFolderId, folderSegments)
      : patientNotesFolderId;

    const savedAt = new Date().toISOString();
    const noteDate = savedAt.split('T')[0];
    const baseTitle = fileNameInput ? fileNameInput.replace(/\.(docx|pdf)$/i, '') : `Clinical_Note_${noteDate}`;
    const fileName = `${baseTitle}.docx`;

    const docxBuffer = await textToDocx(content, baseTitle);
    const docxFileId = await uploadToDrive(
      token,
      fileName,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      targetFolderId,
      docxBuffer,
      {
        savedAt,
        conversionStatus: 'pending_pdf',
        patientFolderId: patientNotesFolderId,
        targetFolderId,
      }
    );

    // Register with scheduler — convert this DOCX to PDF after 10 hours
    const { registerConversionJob } = await import('../jobs/scheduler');
    registerConversionJob({
      fileId: docxFileId,
      patientFolderId: patientNotesFolderId,
      savedAt,
      status: 'pending_pdf',
      refreshToken: req.session.refreshToken || '',
    });

    // Update lastNoteDate on the patient folder so "Last" date reflects the latest note
    fetch(`${driveApi}/files/${patientId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appProperties: { lastNoteDate: noteDate },
      }),
    }).catch(() => {});

    res.json({ success: true, folderId: patientNotesFolderId, savedDate: noteDate });
  } catch (err) {
    console.error('Save note error:', err);
    res.status(500).json({ error: 'Failed to save note.' });
  }
});

// --- USER SETTINGS (stored as a JSON file in Halo root folder) ---

const SETTINGS_FILE_NAME = 'halo_user_settings.json';

async function findSettingsFile(token: string, rootId: string): Promise<string | null> {
  const query = encodeURIComponent(
    `'${rootId}' in parents and name='${SETTINGS_FILE_NAME}' and mimeType='application/json' and trashed=false`
  );
  const data = await driveRequest(token, `/files?q=${query}&fields=files(id)`);
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

// GET /settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const rootId = await getHaloRootFolder(token);
    const fileId = await findSettingsFile(token, rootId);

    if (!fileId) {
      res.json({ settings: null });
      return;
    }

    const dlRes = await fetch(`${driveApi}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const settings = await dlRes.json();
    res.json({ settings });
  } catch (err) {
    console.error('Load settings error:', err);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

// PUT /settings
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'Settings object is required.' });
      return;
    }

    const rootId = await getHaloRootFolder(token);
    const existingFileId = await findSettingsFile(token, rootId);
    const content = JSON.stringify(settings);

    if (existingFileId) {
      // Update existing file
      await fetch(`${uploadApi}/files/${existingFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: content,
      });
    } else {
      // Create new file
      const metadata = {
        name: SETTINGS_FILE_NAME,
        parents: [rootId],
        mimeType: 'application/json',
      };
      const boundary = 'halo_settings_boundary';
      const body = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n` +
        `--${boundary}--`
      );
      await fetch(`${uploadApi}/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ error: 'Failed to save settings.' });
  }
});

// GET /patients/:id/summary
router.get('/patients/:id/summary', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const patientId = req.params.id as string;
    const { markdown, state } = await ensurePatientSummaryUpToDate(token, patientId);
    res.json({ markdown, state });
  } catch (err) {
    console.error('Patient summary error:', err);
    res.status(500).json({ error: 'Failed to build patient summary.' });
  }
});

// POST /patients/:id/summary/refresh
router.post('/patients/:id/summary/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const patientId = req.params.id as string;
    void refreshPatientSummaryInBackground(token, patientId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Patient summary refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh patient summary.' });
  }
});

// GET /admissions-board
router.get('/admissions-board', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const { board } = await loadAdmissionsBoard(token);
    res.json({ board });
  } catch (err) {
    console.error('Load admissions board error:', err);
    res.status(500).json({ error: 'Failed to load admissions board.' });
  }
});

// PUT /admissions-board
router.put('/admissions-board', async (req: Request, res: Response) => {
  try {
    const token = req.session.accessToken!;
    const board = normalizeAdmissionsBoard(req.body);
    const saved = await saveAdmissionsBoard(token, board);
    res.json({ board: saved });
  } catch (err) {
    console.error('Save admissions board error:', err);
    res.status(500).json({ error: 'Failed to save admissions board.' });
  }
});

export default router;
