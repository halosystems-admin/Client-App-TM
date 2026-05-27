#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pg = require('pg');

async function main() {
  const connectionString = (
    process.env.HALO_PRODUCTION_DATABASE_URL ||
    process.env.SCRIBE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260527120000_halo_core_users_practices.sql'),
    'utf8'
  );
  try {
    await client.query(sql);
    console.log('migration applied');
  } catch (e) {
    console.error('migration error:', e.message);
    process.exit(1);
  }
  const tables = await client.query(
    `SELECT table_schema, table_name FROM information_schema.tables WHERE table_name IN ('users','practices') ORDER BY 1,2`
  );
  console.log(tables.rows);
  client.release();
  await pool.end();
}

main();
