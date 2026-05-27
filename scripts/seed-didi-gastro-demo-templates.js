#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Provision halo-core identity + Didi Gastro demo Scribe templates (idempotent).
 *
 *   HALO_PRODUCTION_DATABASE_URL=... node scripts/seed-didi-gastro-demo-templates.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pg = require('pg');

const DEMO_EMAIL = 'dr.didigastro@halo.africa';
const DEMO_NAME = 'Dr Didintle Mokgoko';
const PRACTICE_ID = '77777777-7777-7777-7777-777777777777';
const PRACTICE_NAME = 'Dr Didintle Mokgoko — Didi Gastro';

const DOCX_PATHS = {
  'Clerking Sheet': 'D:\\PROJECTS\\HALO Medical\\Didi Mokgoko\\Templates\\Clerking Sheet.docx',
  'In-patient followup admission':
    'D:\\PROJECTS\\HALO Medical\\Didi Mokgoko\\Templates\\In-patient followup admission.docx',
  'Medical Certificate': 'D:\\PROJECTS\\HALO Medical\\Didi Mokgoko\\Templates\\Medical Certificate.docx',
};

const TEMPLATES = [
  {
    name: 'Clerking Sheet',
    isDefault: true,
    systemPromptMd: `You are an expert South African medical scribe for Dr Didintle Mokgoko.

Generate a concise, clinically accurate clerking note in markdown using exactly this structure:

# PATIENT CLERKING SHEET

## Patient Details
Include patient identifiers and relevant demographics if provided in the transcript or patient context. Do not invent missing details.

## Known Problems
List known diagnoses or chronic problems. If none are provided, write "Not stated."

## Presenting Complaint
Summarise the main presenting complaint.

## History of Presenting Complaint
Write a clear chronological clinical history from the transcript.

## Past Medical History
Include only stated past medical history.

## Medication History
Include current medication and relevant recent medication changes.

## Allergies
Include allergies if stated. If not stated, write "Not stated."

## Family History
Include only relevant stated family history.

## Social History
Include smoking, alcohol, occupation, living situation, or other relevant social history if stated.

## Examination Findings
Summarise examination findings. Include vitals if provided.

## Assessment
List the clinical assessment or differential diagnoses.

## Plan
List the management plan as bullet points.

## Follow-up
State follow-up arrangements.

## Missing information / needs review
List important missing or unclear information that the doctor should review.

Rules:
- Never invent clinical findings, diagnoses, medication, dates, or patient details.
- Use only transcript, patient context, and provided system fields.
- If a section has no information, use "Not stated" unless the section is Missing information / needs review.
- Keep tone professional and suitable for a hospital medical record.
- Output markdown only.`,
  },
  {
    name: 'In-patient followup admission',
    isDefault: false,
    systemPromptMd: `You are an expert South African medical scribe for Dr Didintle Mokgoko.

Generate an in-patient follow-up admission note in markdown using exactly this structure:

# IN-PATIENT FOLLOW-UP ADMISSION

## Known Problem List
List known chronic and active problems.

## Presentation
Summarise the current presentation and reason for admission or review.

## Examination
Include general examination findings and system-specific findings.

### Vitals
- BP:
- Pulse:
- Resp:
- Sats:
- Temp:

Only fill vitals if stated. Leave blank after the label if not stated.

## New Problems / Assessment
List new problems, working diagnoses, and clinical assessment.

## Investigations
List investigations already done, pending, or planned.

## Treatment
List treatment given or planned, including medications, fluids, procedures, referrals, and monitoring.

## Follow-up / Plan
List next steps and follow-up plan.

Rules:
- Never invent clinical findings, vitals, diagnoses, medication, dates, or patient details.
- Use only transcript, patient context, and provided system fields.
- Keep concise hospital-style wording.
- If information is missing, say "Not stated" or leave vitals blank.
- Output markdown only.`,
    legacyNames: ['In-patient Follow-up Admission', 'inpatient_followup_admission'],
  },
  {
    name: 'Medical Certificate',
    isDefault: false,
    systemPromptMd: `You are an expert South African medical scribe preparing a medical certificate for Dr D. Mokgoko.

Generate an editable medical certificate in markdown using the fixed certificate wording below.
Use only the provided transcript, patient context, and system fields.
Do not invent dates, reasons, or patient details.

Required variables:
- Patient name
- Date examined
- Basis of certificate: choose one if clearly stated:
  1. Based on my examination
  2. According to my knowledge
  3. As I was informed
- Pronoun: he or she, if known
- Unfit from date
- Unfit to date
- Reason: illness, hospitalization, injury, or stated alternative
- Normal duty/school resume date

Output structure:

# MEDICAL CERTIFICATE

The undersigned hereby certifies that:

**[Patient Name]**

was examined by me on **[Date Examined]**.

**[Basis of Certificate]**, **[he/she]** was unfit for work from **[Start Date]** to **[End Date]** due to **[Reason]**.

Normal duty/school may resume on **[Resume Date]**.

Kind regards,

**Dr D. Mokgoko**

## Missing information / needs review
List any missing variables that the doctor must complete before finalising.

Rules:
- If a required variable is missing, use [Needs doctor input] and list it under Missing information / needs review.
- Preserve the medical certificate style.
- Keep output editable.
- Output markdown only.`,
    requirements: [
      ['patient_name', 'Patient name', 'text', 0, 'Patient full name as it should appear on the certificate.', 'John Smith'],
      ['examined_date', 'Date examined', 'date', 1, 'Date the patient was examined.', 'Examined on 3 February 2026'],
      ['certificate_basis', 'Basis of certificate', 'text', 2, 'Based on my examination / According to my knowledge / As I was informed.', 'Based on my examination'],
      ['pronoun', 'Pronoun', 'text', 3, 'he or she', 'she'],
      ['leave_start_date', 'Sick leave start date', 'date', 4, 'First day unfit for work.', 'Unfit from 3 February 2026'],
      ['leave_end_date', 'Sick leave end date', 'date', 5, 'Last day unfit for work.', 'Unfit to 7 February 2026'],
      ['reason', 'Reason', 'text', 6, 'illness, hospitalization, injury, or stated alternative', 'illness'],
      ['resume_duty_date', 'Resume duty date', 'date', 7, 'Date normal duty/school may resume.', 'Resume duty on 10 February 2026'],
    ],
  },
];

async function applyIdentityMigration(client) {
  const migrationPath = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260527120000_halo_core_users_practices.sql'
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await client.query(sql);
}

async function upsertPracticeAndUser(client, dryRun) {
  if (!dryRun) {
    await client.query(
      `
        INSERT INTO practices (id, name, subdomain, specialty)
        VALUES ($1::uuid, $2, 'didi-gastro', 'gastroenterology')
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          specialty = EXCLUDED.specialty
      `,
      [PRACTICE_ID, PRACTICE_NAME]
    );
  }

  const existingUser = await client.query(
    `SELECT id::text, practice_id::text, google_uid, role, email FROM users WHERE lower(email) = lower($1)`,
    [DEMO_EMAIL]
  );

  let userId = existingUser.rows[0]?.id;
  if (existingUser.rows.length > 1) {
    throw new Error(`Duplicate users for ${DEMO_EMAIL}`);
  }

  if (!userId && !dryRun) {
    const ins = await client.query(
      `
        INSERT INTO users (practice_id, role, name, email)
        VALUES ($1::uuid, 'doctor', $2, $3)
        RETURNING id::text
      `,
      [PRACTICE_ID, DEMO_NAME, DEMO_EMAIL]
    );
    userId = ins.rows[0].id;
  } else if (userId && !dryRun) {
    await client.query(
      `
        UPDATE users
        SET practice_id = $2::uuid, role = 'doctor', name = $3
        WHERE id::text = $1
      `,
      [userId, PRACTICE_ID, DEMO_NAME]
    );
  }

  return { userId, userRow: existingUser.rows[0] };
}

async function findTemplateId(client, spec) {
  const byName = await client.query(
    `SELECT id::text, name FROM scribe_templates WHERE practice_id::text = $1 AND name = $2 LIMIT 1`,
    [PRACTICE_ID, spec.name]
  );
  if (byName.rows[0]) return byName.rows[0].id;

  if (spec.legacyNames?.length) {
    for (const legacy of spec.legacyNames) {
      const byLegacy = await client.query(
        `
          SELECT id::text, name FROM scribe_templates
          WHERE practice_id::text = $1
            AND (name = $2 OR firebase_template_id = $2)
          LIMIT 1
        `,
        [PRACTICE_ID, legacy]
      );
      if (byLegacy.rows[0]) return byLegacy.rows[0].id;
    }
  }

  return null;
}

async function main() {
  const connectionString = (
    process.env.HALO_PRODUCTION_DATABASE_URL ||
    process.env.SCRIBE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
  if (!connectionString) {
    console.error('Set HALO_PRODUCTION_DATABASE_URL or DATABASE_URL.');
    process.exit(1);
  }

  const dryRun = String(process.env.HALO_SCRIBE_SEED_DRY_RUN || '').trim() === '1';
  const needsSsl =
    connectionString.includes('supabase') ||
    connectionString.includes('rds.amazonaws.com') ||
    String(process.env.PGSSLMODE || '').trim() === 'require';

  const pool = new pg.Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  const report = { templates: [], prompts: [], requirements: [], docxRefs: [] };

  try {
    if (!dryRun) {
      await client.query('BEGIN');
      await applyIdentityMigration(client);
      await client.query(`SELECT set_config('app.practice_id', $1, true)`, [PRACTICE_ID]);
    }

    const { userId } = await upsertPracticeAndUser(client, dryRun);
    console.log('User ready:', { userId, email: DEMO_EMAIL, practice_id: PRACTICE_ID });

    for (const spec of TEMPLATES) {
      let templateId = await findTemplateId(client, spec);
      const nextVersion = 1;

      if (!templateId && !dryRun) {
        const ins = await client.query(
          `
            INSERT INTO scribe_templates (practice_id, name, specialty, is_default, output_format, version)
            VALUES ($1::uuid, $2, 'gastroenterology', $3, 'markdown', $4)
            RETURNING id::text
          `,
          [PRACTICE_ID, spec.name, spec.isDefault, nextVersion]
        );
        templateId = ins.rows[0].id;
      } else if (templateId && !dryRun) {
        await client.query(
          `
            UPDATE scribe_templates
            SET name = $3, output_format = 'markdown', is_default = $4, version = COALESCE(version, 0) + 1, updated_at = now()
            WHERE id::text = $1 AND practice_id::text = $2
          `,
          [templateId, PRACTICE_ID, spec.name, spec.isDefault]
        );
      }

      report.templates.push({ name: spec.name, id: templateId });

      if (!dryRun && templateId && userId) {
        await client.query(
          `UPDATE scribe_style_prompts SET is_active = false WHERE template_id::text = $1 AND is_active = true`,
          [templateId]
        );

        const promptIns = await client.query(
          `
            INSERT INTO scribe_style_prompts (template_id, version, system_prompt_md, created_by, is_active)
            VALUES ($1::uuid, 1, $2, $3::uuid, true)
            RETURNING id::text
          `,
          [templateId, spec.systemPromptMd, userId]
        );
        report.prompts.push({ template: spec.name, id: promptIns.rows[0].id });

        const docxPath = DOCX_PATHS[spec.name];
        if (docxPath && fs.existsSync(docxPath)) {
          const cfg = await client.query(
            `SELECT id::text FROM scribe_output_configs WHERE template_id::text = $1 LIMIT 1`,
            [templateId]
          );
          const localRef = `local:${docxPath}`;
          if (cfg.rows.length === 0) {
            await client.query(
              `INSERT INTO scribe_output_configs (template_id, output_type, docx_template_drive_id) VALUES ($1::uuid, 'docx_on_demand', $2)`,
              [templateId, localRef]
            );
          } else {
            await client.query(
              `UPDATE scribe_output_configs SET docx_template_drive_id = $2 WHERE template_id::text = $1`,
              [templateId, localRef]
            );
          }
          report.docxRefs.push({ template: spec.name, ref: localRef });
        }

        if (Array.isArray(spec.requirements)) {
          for (const row of spec.requirements) {
            const [key, display_label, type, field_order, doctor_hint, example_phrase] = row;
            await client.query(
              `
                INSERT INTO scribe_template_requirements (
                  template_id, key, display_label, type, required, field_order, doctor_hint, example_phrase
                )
                VALUES ($1::uuid, $2, $3, $4, true, $5, $6, $7)
                ON CONFLICT (template_id, key) DO UPDATE SET
                  display_label = EXCLUDED.display_label,
                  type = EXCLUDED.type,
                  required = EXCLUDED.required,
                  field_order = EXCLUDED.field_order,
                  doctor_hint = EXCLUDED.doctor_hint,
                  example_phrase = EXCLUDED.example_phrase
              `,
              [templateId, key, display_label, type, field_order, doctor_hint, example_phrase]
            );
            report.requirements.push({ template: spec.name, key });
          }
        }
      }
    }

    if (!dryRun) {
      await client.query('COMMIT');
    }

    console.log(JSON.stringify({ dryRun, report }, null, 2));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Seed failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
