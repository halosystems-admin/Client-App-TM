import { getScribePool } from './db';

export type FinalizedScribeNoteRow = {
  outputId: string;
  consultationId: string;
  templateId: string | null;
  templateName: string | null;
  firebaseTemplateId: string | null;
  doctorEdited: boolean;
  finalizedAt: string;
  preview: string;
  finalMarkdown: string;
};

function buildPreview(markdown: string, maxLen = 160): string {
  const parts: string[] = [];
  for (const rawLine of markdown.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/^#{1,6}\s+/, '');
    line = line.replace(/^\s*[-*+]\s+/, '');
    line = line.replace(/\*\*(.+?)\*\*/g, '$1');
    if (line) parts.push(line);
    if (parts.join(' · ').length >= maxLen) break;
  }
  const collapsed = parts.join(' · ').replace(/\s+/g, ' ').trim();
  if (!collapsed) return 'Finalized note';
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen)}…`;
}

export async function listFinalizedScribeNotesForPatient(
  practiceId: string,
  patientId: string
): Promise<FinalizedScribeNoteRow[]> {
  const pool = getScribePool();

  const result = await pool.query<{
    output_id: string;
    consultation_id: string;
    template_id: string | null;
    template_name: string | null;
    firebase_template_id: string | null;
    doctor_edited: boolean;
    created_at: Date | string;
    final_markdown: string;
  }>(
    `
      SELECT
        o.id::text AS output_id,
        o.consultation_id::text AS consultation_id,
        o.template_id::text AS template_id,
        t.name AS template_name,
        t.firebase_template_id,
        o.doctor_edited,
        o.created_at,
        o.final_markdown
      FROM scribe_outputs o
      LEFT JOIN scribe_templates t ON t.id = o.template_id
      WHERE o.practice_id::text = $1
        AND o.patient_id::text = $2
        AND o.final_markdown IS NOT NULL
        AND btrim(o.final_markdown) <> ''
        AND EXISTS (
          SELECT 1
          FROM consultation_events e
          WHERE e.event_type = 'scribe_output'
            AND e.event_data->>'scribe_output_id' = o.id::text
        )
      ORDER BY o.created_at DESC
      LIMIT 50
    `,
    [practiceId, patientId]
  );

  return result.rows.map((row) => {
    const finalMarkdown = row.final_markdown.trim();
    const finalizedAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();

    return {
      outputId: row.output_id,
      consultationId: row.consultation_id,
      templateId: row.template_id,
      templateName: row.template_name,
      firebaseTemplateId: row.firebase_template_id,
      doctorEdited: row.doctor_edited,
      finalizedAt,
      preview: buildPreview(finalMarkdown),
      finalMarkdown,
    };
  });
}
