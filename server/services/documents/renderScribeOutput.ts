import { textToDocx } from '../../utils/docx';
import { convertDocxBufferToPdfBuffer } from '../drive';
import { config } from '../../config';
import { buildScribeExportFileName } from '../../utils/docxTemplate';

export type ScribeOutputConfigRow = {
  output_type: string;
  pdf_template_drive_id: string | null;
  pdf_field_mappings_json: unknown;
  docx_template_drive_id: string | null;
};

export type RenderScribeOutputInput = {
  finalMarkdown: string;
  outputType: string;
  templateConfig: ScribeOutputConfigRow | null;
  extractedTemplateVariables: Record<string, unknown>;
  practiceId: string;
  patientId: string;
  consultationId: string;
  templateId: string | null;
  templateName?: string | null;
};

export type RenderScribeDeps = {
  accessToken: string;
  /** Parent folder used for temporary Google Doc import during PDF conversion. */
  driveParentFolderIdForConversion: string;
  /** When true, render DOCX from markdown only (no Drive PDF import) — local/CI without OAuth. */
  mockRenderDocxOnly?: boolean;
};

export type RenderOk = {
  ok: true;
  buffer: Buffer;
  mimeType: string;
  filename: string;
  outputKind: 'markdown_pdf' | 'docx_export' | 'pdf_fill';
};

export type RenderErr = {
  ok: false;
  errorCode: string;
  errorMessage: string;
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function baseFileStem(input: RenderScribeOutputInput): string {
  const named = (input.templateName || '').trim();
  if (named) {
    return buildScribeExportFileName(named, 'docx').replace(/\.docx$/i, '');
  }
  const c = (input.consultationId || 'consult').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
  return `Scribe_${c}_${Date.now()}`;
}

// Demo stabilisation: always use the reliable blank-DOCX path.
// Template header/footer preservation is deferred.
async function renderDocxFromTemplateOrBlank(
  input: RenderScribeOutputInput,
  md: string,
  stem: string
): Promise<Buffer> {
  return textToDocx(md, stem);
}

async function tryMergeToPdfFromDocx(docxBuffer: Buffer): Promise<Buffer | null> {
  if (process.env.SCRIBE_MERGE_PDF_ENABLED !== '1') {
    return null;
  }
  const base =
    process.env.SCRIBE_MERGE_PDF_BASE_URL?.trim() ||
    process.env.HALO_MERGE_PDF_BASE_URL?.trim() ||
    config.notesApiUrl.replace(/\/$/, '');
  const url = `${base}/merge_to_pdf`;
  const body = {
    items: [{ content: docxBuffer.toString('base64'), contentType: 'docx' }],
  };
  console.log('[renderScribeOutput] POST /merge_to_pdf', {
    base,
    urlPath: '/merge_to_pdf',
    itemCount: body.items.length,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.SCRIBE_MERGE_PDF_TIMEOUT_MS || 60_000)),
  });
  if (!res.ok) {
    console.warn('[renderScribeOutput] /merge_to_pdf returned non-OK response', {
      status: res.status,
      statusText: res.statusText,
    });
    return null;
  }
  const data = (await res.json()) as { pdf_base64?: string };
  if (!data.pdf_base64 || typeof data.pdf_base64 !== 'string') {
    console.warn('[renderScribeOutput] /merge_to_pdf response missing pdf_base64');
    return null;
  }
  console.log('[renderScribeOutput] /merge_to_pdf ok', { pdfBytesBase64: data.pdf_base64.length });
  return Buffer.from(data.pdf_base64, 'base64');
}

/**
 * Deterministic render only: uses job_payload.finalMarkdown verbatim (no LLM, no regeneration).
 * With HALO_MOCK_DRIVE_UPLOAD=1 and no OAuth token, returns DOCX from markdown (avoids Drive PDF import in CI).
 */
export async function renderScribeOutput(
  input: RenderScribeOutputInput,
  deps: RenderScribeDeps
): Promise<RenderOk | RenderErr> {
  const md = (input.finalMarkdown || '').trim();
  if (!md) {
    return { ok: false, errorCode: 'empty_markdown', errorMessage: 'finalMarkdown is empty.' };
  }

  const stem = baseFileStem(input);
  const exportFileName = (input.templateName || '').trim()
    ? buildScribeExportFileName(input.templateName!.trim(), 'docx')
    : `${stem}.docx`;
  const ot = (input.templateConfig?.output_type || '').trim().toLowerCase();

  const forceMockDocx =
    Boolean(deps.mockRenderDocxOnly) ||
    (process.env.HALO_MOCK_DRIVE_UPLOAD === '1' &&
      (!deps.accessToken?.trim() || !deps.driveParentFolderIdForConversion?.trim()));

  if (forceMockDocx && ot !== 'pdf_fill') {
    const docxBuf = await renderDocxFromTemplateOrBlank(input, md, stem);
    return {
      ok: true,
      buffer: docxBuf,
      mimeType: DOCX_MIME,
      filename: exportFileName,
      outputKind: 'docx_export',
    };
  }

  if (ot === 'pdf_fill') {
    if (!input.templateConfig?.pdf_template_drive_id) {
      return {
        ok: false,
        errorCode: 'unsupported_renderer',
        errorMessage:
          'pdf_fill requires pdf_template_drive_id and a full merge pipeline; use default markdown PDF or enable SCRIBE_MERGE_PDF_ENABLED with /merge_to_pdf.',
      };
    }
    const docxBuf = await renderDocxFromTemplateOrBlank(input, md, stem);
    const merged = await tryMergeToPdfFromDocx(docxBuf);
    if (!merged) {
      return {
        ok: false,
        errorCode: 'unsupported_renderer',
        errorMessage:
          'pdf_fill merge is not configured (set SCRIBE_MERGE_PDF_ENABLED=1 and SCRIBE_MERGE_PDF_BASE_URL or use default PDF path).',
      };
    }
    return {
      ok: true,
      buffer: merged,
      mimeType: 'application/pdf',
      filename: `${stem}_filled.pdf`,
      outputKind: 'pdf_fill',
    };
  }

  if (ot === 'docx_on_demand' || ot === 'docx') {
    const docxBuf = await renderDocxFromTemplateOrBlank(input, md, stem);
    return {
      ok: true,
      buffer: docxBuf,
      mimeType: DOCX_MIME,
      filename: exportFileName,
      outputKind: 'docx_export',
    };
  }

  if (!deps.accessToken || !deps.driveParentFolderIdForConversion) {
    return {
      ok: false,
      errorCode: 'missing_drive_context',
      errorMessage: 'Default markdown→PDF requires accessToken and driveParentFolderIdForConversion.',
    };
  }

  try {
    const docxBuf = await renderDocxFromTemplateOrBlank(input, md, stem);
    const pdfBuf = await convertDocxBufferToPdfBuffer(
      deps.accessToken,
      docxBuf,
      deps.driveParentFolderIdForConversion,
      stem
    );
    return {
      ok: true,
      buffer: pdfBuf,
      mimeType: 'application/pdf',
      filename: `${stem}.pdf`,
      outputKind: 'markdown_pdf',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errorCode: 'render_failed', errorMessage: msg };
  }
}
