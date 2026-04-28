import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { requireAuth } from '../middleware/requireAuth';
import { config } from '../config';
import { getTemplates, generateNote } from '../services/haloApi';
import { getStoredHaloUserId } from '../services/userSettings';
import {
  convertDocxBufferToPdfBuffer,
  getOrCreatePatientNotesFolder,
  uploadToDrive,
} from '../services/drive';

const router = Router();
router.use(requireAuth);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function resolveHaloUserId(req: Request, fallback: string): Promise<string> {
  const resolved = await getStoredHaloUserId(req.session.accessToken!);
  return resolved || fallback;
}

function isSmtpConfigured(): boolean {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
}

function buildBaseName(fileName: string | undefined, fallback: string): string {
  const trimmed = fileName?.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\.(docx|pdf)$/i, '');
}

// POST /api/halo/templates
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const userId = await resolveHaloUserId(req, (req.body?.user_id as string) || config.haloUserId);
    const templates = await getTemplates(userId);
    res.json(templates);
  } catch (err) {
    console.error('Halo get_templates error:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch templates.';
    res.status(err instanceof Error && message.includes('502') ? 502 : 400).json({ error: message });
  }
});

// POST /api/halo/generate-note
// Body: { user_id?, template_id?, text, return_type: 'note' | 'docx', patientId?, fileName?, useMobileConfig? }
// If useMobileConfig is true, use config.haloMobileUserId and config.haloMobileTemplateId (for mobile preview).
// If return_type === 'docx' and patientId is set, uploads DOCX to patient's Patient Notes folder and returns { success, fileId, name }.
router.post('/generate-note', async (req: Request, res: Response) => {
  try {
    const { user_id, template_id, text, return_type, patientId, fileName, useMobileConfig } = req.body as {
      user_id?: string;
      template_id?: string;
      text: string;
      return_type: 'note' | 'docx';
      patientId?: string;
      fileName?: string;
      useMobileConfig?: boolean;
    };

    if (typeof text !== 'string') {
      res.status(400).json({ error: 'text is required.' });
      return;
    }

    const userId = useMobileConfig
      ? await resolveHaloUserId(req, config.haloMobileUserId)
      : await resolveHaloUserId(req, user_id || config.haloUserId);
    const templateId = useMobileConfig ? config.haloMobileTemplateId : (template_id || 'clinical_note');
    console.log('[Halo] generate-note request:', { userId: userId.slice(0, 8) + '…', templateId, return_type, textLength: text.length });
    const result = await generateNote({ user_id: userId, template_id: templateId, text, return_type });

    if (return_type === 'note') {
      res.json({ notes: result });
      return;
    }

    // return_type === 'docx': result is Buffer
    const buffer = result as Buffer;
    if (!patientId || !req.session.accessToken) {
      res.status(400).json({ error: 'patientId is required to save DOCX to Drive.' });
      return;
    }

    const token = req.session.accessToken;
    const patientNotesFolderId = await getOrCreatePatientNotesFolder(token, patientId);
    const baseName = fileName && fileName.trim() ? fileName.replace(/\.docx$/i, '') : `Clinical_Note_${new Date().toISOString().split('T')[0]}`;
    const finalFileName = baseName.endsWith('.docx') ? baseName : `${baseName}.docx`;

    const fileId = await uploadToDrive(
      token,
      finalFileName,
      DOCX_MIME,
      patientNotesFolderId,
      buffer,
      {
        internalType: 'halo_note_export',
        haloGenerated: 'true',
      }
    );

    res.json({ success: true, fileId, name: finalFileName });
  } catch (err) {
    console.error('[Halo] generate-note error:', err);
    const message = err instanceof Error ? err.message : 'Note generation failed.';
    const status = message.includes('502') ? 502 : message.includes('404') ? 404 : message.includes('Invalid') ? 400 : message.includes('too long') ? 504 : 500;
    res.status(status).json({ error: message });
  }
});

// POST /api/halo/preview-note-pdf
// Body: { user_id?, template_id?, text, patientId, fileName?, useMobileConfig? }
router.post('/preview-note-pdf', async (req: Request, res: Response) => {
  try {
    const { user_id, template_id, text, patientId, fileName, useMobileConfig } = req.body as {
      user_id?: string;
      template_id?: string;
      text: string;
      patientId?: string;
      fileName?: string;
      useMobileConfig?: boolean;
    };

    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text is required.' });
      return;
    }

    if (!patientId) {
      res.status(400).json({ error: 'patientId is required for PDF preview.' });
      return;
    }

    if (!req.session.accessToken) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const userId = useMobileConfig
      ? await resolveHaloUserId(req, config.haloMobileUserId)
      : await resolveHaloUserId(req, user_id || config.haloUserId);
    const templateId = useMobileConfig ? config.haloMobileTemplateId : (template_id || 'clinical_note');
    const docxBuffer = await generateNote({
      user_id: userId,
      template_id: templateId,
      text,
      return_type: 'docx',
    }) as Buffer;

    const token = req.session.accessToken;
    const patientNotesFolderId = await getOrCreatePatientNotesFolder(token, patientId);
    const baseName = buildBaseName(
      fileName,
      `Clinical_Note_Preview_${new Date().toISOString().split('T')[0]}`
    );
    const pdfBuffer = await convertDocxBufferToPdfBuffer(
      token,
      docxBuffer,
      patientNotesFolderId,
      baseName
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${baseName}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[Halo] preview-note-pdf error:', err);
    const message = err instanceof Error ? err.message : 'PDF preview failed.';
    const status = message.includes('502') ? 502 : message.includes('404') ? 404 : message.includes('Invalid') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

// POST /api/halo/confirm-and-send (mobile)
// Body: { patientId, text, fileName?, patientName? }
// Generates DOCX with mobile Halo config, saves to patient Patient Notes folder, emails DOCX to signed-in user from admin@halo.africa.
router.post('/confirm-and-send', async (req: Request, res: Response) => {
  try {
    const { patientId, text, fileName, patientName } = req.body as {
      patientId?: string;
      text?: string;
      fileName?: string;
      patientName?: string;
    };

    if (!patientId || typeof text !== 'string') {
      res.status(400).json({ error: 'patientId and text are required.' });
      return;
    }

    if (!req.session.accessToken) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const userId = await resolveHaloUserId(req, config.haloMobileUserId);
    const templateId = config.haloMobileTemplateId;
    const result = await generateNote({
      user_id: userId,
      template_id: templateId,
      text,
      return_type: 'docx',
    });

    const buffer = result as Buffer;
    const token = req.session.accessToken;
    const patientNotesFolderId = await getOrCreatePatientNotesFolder(token, patientId);
    const baseName = buildBaseName(
      fileName,
      `Report_${new Date().toISOString().split('T')[0]}`
    );
    const finalFileName = baseName.endsWith('.docx') ? baseName : `${baseName}.docx`;

    const fileId = await uploadToDrive(
      token,
      finalFileName,
      DOCX_MIME,
      patientNotesFolderId,
      buffer,
      {
        internalType: 'halo_note_export',
        haloGenerated: 'true',
      }
    );

    let emailSent = false;
    const toEmail = req.session.userEmail;
    if (toEmail && isSmtpConfigured()) {
      try {
        const transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpSecure,
          auth: { user: config.smtpUser, pass: config.smtpPass },
        });
        const subjectPatient = (patientName && patientName.trim()) || 'Patient';
        await transporter.sendMail({
          from: config.adminEmail,
          to: toEmail,
          subject: `Your report: ${subjectPatient}`,
          text: `Please find the attached report for ${subjectPatient}.`,
          attachments: [{ filename: finalFileName, content: buffer }],
        });
        emailSent = true;
      } catch (emailErr) {
        console.error('Halo confirm-and-send email error:', emailErr);
        // Drive save already succeeded; respond with success and emailSent: false
      }
    }

    res.json({ success: true, fileId, name: finalFileName, emailSent });
  } catch (err) {
    console.error('Halo confirm-and-send error:', err);
    const message = err instanceof Error ? err.message : 'Confirm and send failed.';
    const status = message.includes('502') ? 502 : message.includes('Invalid') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

// POST /api/halo/extract-patient-sticker
// Body: { base64: string }
// Proxies to external Halo Functions API: POST /extract_patient_sticker
router.post('/extract-patient-sticker', async (req: Request, res: Response) => {
  try {
    const { base64 } = req.body as { base64?: string };

    if (!base64 || typeof base64 !== 'string') {
      res.status(400).json({ error: 'base64 is required.' });
      return;
    }

    const response = await fetch(`${config.haloApiBaseUrl}/extract_patient_sticker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: base64,
        contentType: 'image',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Halo extract_patient_sticker returned ${response.status}:`, errorText);
      res.status(response.status).json({
        error: `Failed to extract patient sticker (${response.status})`,
      });
      return;
    }

    const data = await response.json() as Record<string, unknown>;

    // Temporary diagnostic log: capture upstream extraction payload shape/values (no image payload).
    console.log('[Halo] extract_patient_sticker raw response:', data);

    const firstString = (source: Record<string, unknown>, keys: string[]): string => {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return '';
    };

    const normalizeMissing = (value: string): string => {
      const normalized = value.trim().toLowerCase();
      if (!normalized || ['not_found', 'unknown', 'n/a', 'na', 'none', 'null', '-'].includes(normalized)) {
        return '';
      }
      return value.trim();
    };

    const normalizeDob = (value: string): string => {
      const cleaned = normalizeMissing(value);
      if (!cleaned) return '';

      // Convert DD.MM.YYYY (and common DMY delimiters) to YYYY-MM-DD.
      const dmy = cleaned.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
      if (dmy) {
        return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      }

      // Preserve ISO-ish values while normalizing separator.
      const ymd = cleaned.match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/);
      if (ymd) {
        return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
      }

      return cleaned;
    };

    const normalizeGender = (value: string): string => {
      const cleaned = normalizeMissing(value);
      if (!cleaned) return '';
      const normalized = cleaned.toLowerCase();
      if (normalized === 'm' || normalized === 'male') return 'Male';
      if (normalized === 'f' || normalized === 'female') return 'Female';
      return cleaned;
    };

    const patientName = firstString(data, ['patient_name', 'patientName', 'name', 'full_name', 'fullName']);
    const patientIdRaw = firstString(data, [
      'patient_id',
      'patientId',
      'id',
      'case',
      'case_number',
      'caseNo',
      'pmi',
      'pmi_number',
      'mrn',
      'hospital_number',
    ]);
    const dobRaw = firstString(data, ['dob', 'date_of_birth', 'dateOfBirth', 'birth_date', 'patient_dob']);
    const genderRaw = firstString(data, ['gender', 'sex', 'patient_gender', 'patient_sex']);

    const patientId = normalizeMissing(patientIdRaw);
    const dob = normalizeDob(dobRaw);
    const gender = normalizeGender(genderRaw);

    res.json({
      patient_name: patientName,
      patient_id: patientId,
      dob,
      gender,
    });
  } catch (err) {
    console.error('Halo extract-patient-sticker error:', err);
    const message = err instanceof Error ? err.message : 'Failed to extract patient sticker.';
    res.status(500).json({ error: message });
  }
});

export default router;
