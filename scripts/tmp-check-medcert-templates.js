/* eslint-disable no-console */
require('dotenv').config();

const { Pool } = require('pg');

async function main() {
  const url = process.env.SCRIBE_DATABASE_URL || process.env.HALO_PRODUCTION_DATABASE_URL;
  if (!url) throw new Error('Missing SCRIBE_DATABASE_URL (or HALO_PRODUCTION_DATABASE_URL)');

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  const practice = '77777777-7777-7777-7777-777777777777';
  const templates = await pool.query(
    `
      SELECT id::text AS id, name, firebase_template_id
      FROM scribe_templates
      WHERE practice_id = $1::uuid
        AND name ILIKE '%medical certificate%'
      ORDER BY updated_at DESC
    `,
    [practice]
  );

  console.log('templates', templates.rows);

  for (const t of templates.rows) {
    const reqs = await pool.query(
      `
        SELECT key, type, required
        FROM scribe_template_requirements
        WHERE template_id = $1::uuid
        ORDER BY field_order ASC NULLS LAST, created_at ASC
      `,
      [t.id]
    );
      console.log('template', t.id, t.name, 'req_count', reqs.rows.length);
      for (const r of reqs.rows) {
        console.log('  key=%s type=%s required=%s', r.key, r.type, r.required);
      }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

