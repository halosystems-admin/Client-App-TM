# Database architecture (bridge mode)

**Status:** Current production layout. No migration performed — main app and Scribe intentionally use separate Postgres targets.

## Ownership

| Variable | Database | Used for |
|----------|----------|----------|
| `DATABASE_URL` | **AWS RDS** (halo-main today) | Express session store, OAuth login persistence, main app tables on RDS |
| `SCRIBE_DATABASE_URL` | **halo-core Supabase** | Scribe templates, `users`, `practices`, style prompts, outputs, requirements, finalize writes |

## Rules

1. **Login / session / OAuth** always use `DATABASE_URL` (RDS). Do not move sessions to Supabase without a planned migration.
2. **Scribe** reads and writes halo-core only through `getScribePool()` → `SCRIBE_DATABASE_URL`.
3. In production on **halo-main**, `SCRIBE_DATABASE_URL` is **required** when `DATABASE_URL` is RDS.
4. On **halo-api-scribe-production**, `DATABASE_URL` may point at halo-core Supabase (dedicated Scribe app); the server detects Supabase and allows that single URL.
5. Never use `DATABASE_URL` (RDS) for `scribe_templates`, `scribe_style_prompts`, or `users` lookups in production bridge mode.

## Request flow (halo-main / api.halo.africa)

```
Google OAuth → session row in AWS RDS (DATABASE_URL)
/api/auth/me → resolve user in halo-core (SCRIBE_DATABASE_URL) → session.practiceId
/api/scribe/* → proxy or in-process → halo-core (SCRIBE_DATABASE_URL)
```

## Code entry points

| Concern | Module |
|---------|--------|
| Main DB label (logs only) | `server/lib/databaseTargets.ts` |
| Scribe connection string | `server/services/scribe/dbConfig.ts` |
| Scribe pool (all Scribe SQL) | `server/services/scribe/db.ts` → `getScribePool()` |
| Startup validation | `server/lib/startupDatabaseValidation.ts` |

## Heroku (expected)

| App | `DATABASE_URL` | `SCRIBE_DATABASE_URL` |
|-----|----------------|------------------------|
| `halo-main` | AWS RDS | halo-core Supabase |
| `halo-api-scribe-production` | halo-core Supabase | (optional; falls back to Supabase `DATABASE_URL`) |
| `halo-client-tm` | (client build) | N/A |

## Local development

- Single local Postgres: set `SCRIBE_DATABASE_URL` to halo-core (or use `DATABASE_URL` fallback in non-production only).
- Scripts may use `HALO_PRODUCTION_DATABASE_URL` for read-only or seed runs against halo-core — never commit values.

See also: [database-migration-path.md](./database-migration-path.md), [scribe-cloud-env-vars.example.md](./scribe-cloud-env-vars.example.md).
