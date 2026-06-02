# Scribe cloud environment variables (names only)

**No values in this file.** Store secrets in a team vault or deployment platform. Never commit `.env` with production/staging credentials.

---

## Local / dev

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `DATABASE_URL` | Local dev, import (local) | Postgres connection for API and scripts | Yes | Yes | Yes |
| `HALO_IMPORT_PRACTICE_ID` | Local import, activation | Pilot practice UUID | No | Optional | Yes |
| `HALO_SCRIBE_ACTIVATE_LOCAL_DEV` | Local dev server | Enables local activation/persistence guards | No | No | **Yes — local only** |
| `HALO_SCRIBE_AD_SKIP_DOCUMENT_JOBS` | Local dev | Skips `document_sync_jobs` locally | No | No | **Yes — local only** |
| `HALO_VERIFY_SCRIBE_E2E` | Local E2E | Dev session bootstrap for scripts | No | No | **Yes — local only** |
| `HALO_SCRIBE_E2E_BASE_URL` | Local scripts | API base (use `http://127.0.0.1:3000` on Windows) | No | No | Yes |
| `HALO_SCRIBE_AD_ACTIVATION_WRITE` | Local persistence script | Enables write mode in activation script | No | No | Yes |
| `PORT` | Local API | HTTP port | No | No | Yes |
| `NODE_ENV` | All | `development` locally | No | No | Yes |
| `SESSION_SECRET` | Local API | Session signing | Yes | Yes | Yes |
| `GEMINI_API_KEY` | Local generate | LLM for Scribe stream | Yes | Yes | Yes |
| `FRONTEND_URL` / `CLIENT_URL` | Local | CORS / redirects (`http://localhost:5173`) | No | No | Yes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Local OAuth | User login (optional locally) | Yes | Yes | Yes |
| `VITE_API_URL` | Client local | Frontend → API (`http://localhost:3000`) | No | Optional | Yes |

---

## Staging Supabase

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `HALO_STAGING_DATABASE_URL` | Staging import, API | Staging Postgres connection string | Yes | Yes | No — staging sessions only |
| `HALO_STAGING_SUPABASE_URL` | Staging identity | Staging project dashboard URL (mismatch checks) | No | Yes | No |
| `HALO_STAGING_IMPORT_PRACTICE_ID` | Staging import | Must match `HALO_IMPORT_PRACTICE_ID` on staging writes | No | No | No |
| `HALO_SCRIBE_STAGING_IMPORT` | Staging import write | Opt-in `1` for staging DB writes | No | No | No |
| `DATABASE_URL` | Staging import | Must **equal** `HALO_STAGING_DATABASE_URL` during import | Yes | Yes | No |

---

## Production Supabase

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `HALO_PRODUCTION_DATABASE_URL` | Prod identity | Production Postgres (comparison / prod deploy) | Yes | Yes | No |
| `HALO_PRODUCTION_SUPABASE_URL` | Prod identity | Production project URL (mismatch checks) | No | Yes | No |

---

## LLM

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `GEMINI_API_KEY` | Generate | Google Gemini for Scribe SSE | Yes | Yes | Yes locally; staging/prod use separate keys |
| `DEEPGRAM_API_KEY` | Dictation | Optional transcription | Yes | Yes | Yes |

---

## App / API deployment

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `NODE_ENV` | Deploy | `production` on hosted API | No | No | N/A |
| `DATABASE_URL` | **halo-main** prod | **Main app + session store** (currently AWS RDS). Not halo-core. | Yes | Yes | No |
| `SCRIBE_DATABASE_URL` | **halo-main** prod | **halo-core Supabase** for Scribe templates, users, prompts, outputs. Required in bridge mode. | Yes | Yes | No |
| `DATABASE_URL` | **halo-api-scribe-production** | halo-core Supabase (dedicated Scribe API) | Yes | Yes | No |
| `SCRIBE_SERVICE_URL` | halo-main | Canonical Scribe backend URL when proxying. Must be `https://halo-api-scribe-production-2002614584c0.herokuapp.com` in production. | No | No | No |
| `SESSION_SECRET` | Deploy | Session signing | Yes | Yes | No |
| `FRONTEND_URL` / `CLIENT_URL` | Deploy | Staging/prod frontend origin for CORS | No | No | No |
| `PRODUCTION_URL` | Prod OAuth | OAuth redirect base | No | No | No |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Deploy | User OAuth | Yes | Yes | No |
| `SCRIBE_PRACTICE_ID` | Fallback | Avoid in prod; prefer session practice | No | No | Local only |
| `COOKIE_DOMAIN` | Deploy | Cross-subdomain cookies if needed | No | Optional | No |
| `IS_FRONTEND` | CI/build | Split API vs client build | No | No | N/A |

### Client (Vite)

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `VITE_API_URL` | Client deploy | Staging/prod API base URL | No | No | No |

---

## Public app Scribe routing

The public production app is the user-facing app. In the current production model, the browser does **not** call the canonical Scribe backend directly.

```
browser
→ public app backend /api/scribe/*
→ proxy to https://halo-api-scribe-production-2002614584c0.herokuapp.com
```

Production requirements:

- `SCRIBE_SERVICE_URL` is required in production.
- It must point to `https://halo-api-scribe-production-2002614584c0.herokuapp.com`.
- It must not be blank or repointed at the public app itself.
- In-process Scribe is development fallback only.

Ownership:

- Public app: browser/session/auth/UI.
- Canonical Scribe backend: transcript persistence, `scribe_outputs`, `consultation_events`, `document_sync_jobs`, and Drive document output.

---

## Drive / document worker

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `DOCUMENT_SYNC_GOOGLE_REFRESH_TOKEN` | Staging/prod worker | Service account / OAuth refresh for sync worker | Yes | Yes | No |
| `HALO_MOCK_DRIVE_UPLOAD` | Test | Mock Drive upload | No | No | Staging test only |
| `DOCUMENT_SYNC_MAX_ATTEMPTS` | Worker | Queue retry cap | No | No | No |
| `SCRIBE_MERGE_PDF_ENABLED` | Optional PDF | Enable PDF merge path | No | No | No |
| `SCRIBE_MERGE_PDF_BASE_URL` / `HALO_MERGE_PDF_BASE_URL` | Optional PDF | External merge service | No | No | No |

**Unset on staging API:** `HALO_SCRIBE_ACTIVATE_LOCAL_DEV`, `HALO_SCRIBE_AD_SKIP_DOCUMENT_JOBS` (unless deliberately testing skip).

---

## Scribe import / activation gates

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `HALO_SCRIBE_IMPORT_WRITE` | Template import | `1` to write inactive template | No | No | Local or staging (with gates) |
| `HALO_SCRIBE_PROMPT_IMPORT_WRITE` | Prompt import | `1` to write inactive prompt | No | No | Local or staging (with gates) |
| `HALO_TEMPLATE_RAW_INPUT` | Import | Path to Firebase export JSON | No | No | Yes |
| `HALO_REVIEWED_SYSTEM_PROMPT_INPUT` | Replace prompt | Path to reviewed prompt markdown file | No | No | Yes — file must not be committed if sensitive |
| `HALO_SCRIBE_ACTIVATION_REHEARSAL` | Rehearsal | Forbidden on staging import writes | No | No | Local rehearsal only |
| `HALO_SCRIBE_MOCK_LLM` | Rehearsal | Forbidden on staging import writes | No | No | Local only |
| `HALO_SCRIBE_ALLOW_REAL_LLM` | Rehearsal | Forbidden on staging import writes | No | No | Local only |

---

## Verification / test flags

| Name | Phase | Description | Secret | Never commit | Local-only phases OK |
|------|-------|-------------|--------|--------------|----------------------|
| `HALO_SCRIBE_E2E_BASE_URL` | Scripts | API base for E2E / activation | No | No | Yes |
| `HALO_SCRIBE_AD_GEN_TIMEOUT_MS` | Scripts | Generate timeout | No | No | Yes |
| `HALO_AD_ACTIVATION_PERSISTENCE_RESULT_OUTPUT` | Scripts | Report output path | No | No | Yes |

---

## Legacy / unclassified (warn if present)

| Name | Notes |
|------|--------|
| `HALO_LEGACY_DATABASE_URL` | Do not use as staging without explicit classification |
| `HALO_OLD_DATABASE_URL` | Same |
| `HALO_PRE_REBUILD_DATABASE_URL` | Same |
| `SUPABASE_DB_URL` / `POSTGRES_URL` | Prefer `DATABASE_URL` + `HALO_STAGING_DATABASE_URL` |

Run `npm run check:scribe-cloud-env` before staging sessions (read-only).
