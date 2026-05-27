# Future database unification (not in scope today)

Today HALO runs in **bridge mode**: main app session/auth on AWS RDS, Scribe clinical data on halo-core Supabase. **Do not migrate RDS into Supabase without following this plan.**

## Phase 1 — Bridge mode (current)

- `DATABASE_URL` → AWS RDS (sessions, legacy main tables).
- `SCRIBE_DATABASE_URL` → halo-core Supabase (Scribe + `users` / `practices` for template scope).
- Explicit code separation via `getScribePool()` vs session store pool.
- **No change to login behavior.**

## Phase 2 — Discovery and parity check

- Inventory RDS tables vs halo-core schema (row counts, critical columns).
- Compare auth-related data: session store remains on RDS until explicitly moved.
- Map `users` / `practices` in halo-core to production doctors (e.g. `dr.didigastro@halo.africa`).
- Document gaps; no writes until sign-off.

## Phase 3 — Controlled migration (if approved)

- Migrate agreed main-app tables to halo-core or replicate read paths.
- Dual-write or read-replica validation window.
- Update `DATABASE_URL` only after parity tests pass (sessions are highest risk).

## Phase 4 — Retire AWS RDS

- Only after:
  - Sessions verified on new target or confirmed to stay on RDS by design
  - All production routes tested (login, Drive, Scribe, calendar)
  - Rollback plan and backup retained
- Remove RDS connection from Heroku config.
- Remove bridge env `SCRIBE_DATABASE_URL` if a single URL is adopted.

## Out of scope for any ad-hoc change

- Replacing `DATABASE_URL` on halo-main with Supabase today
- Moving OAuth session store without a session migration plan
- Pointing Scribe at RDS for templates
