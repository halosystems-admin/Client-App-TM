# Notes API Contract and Legacy PDF Reference

This doc describes the frontend/Express contract for template retrieval and note generation, and where to find the legacy logic to implement in the external FastAPI backend.

## Express proxy (this repo)

- **POST /api/notes/get_templates** — Body may include `user_id`; if omitted, the proxy sends the session `user_id`. Forwards to `POST ${NOTES_API_URL}/get_templates`.
- **POST /api/notes/generate_note** — Forwards body to `POST ${NOTES_API_URL}/generate_note`. Response can be JSON `{ "content": "..." }` or binary (DOCX).

Set **NOTES_API_URL** in server `.env` (e.g. `http://localhost:8000`) to enable the proxy. The client uses the proxy when `notesApiAvailable` is true (derived from `/api/auth/me` when NOTES_API_URL is set).

## FastAPI contract (external backend)

### POST /get_templates

- **Body:** `{ "user_id": "string" }`
- **Behavior:** Query Firebase RTDB at `users/{user_id}/templates` and return that JSON (or `{ templates: [...] }`). Frontend normalizes to a list of `{ id, name?, label?, type? }`.

### POST /generate_note

- **Body:** `user_id`, `template_id`, `text`, `return_type: "note" | "docx"`
- **Behavior (strict legacy):**
  1. Load template for `user_id` + `template_id` (from RTDB or same structure as `/get_templates`).
  2. Apply the **exact** same population rules as the legacy App Script (placeholders, sections, formatting).
  3. If `return_type === "note"`: return JSON `{ "content": "<populated note text>" }` or plain text.
  4. If `return_type === "docx"`: generate DOCX (e.g. `python-docx`) and return binary with `Content-Disposition` / `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

**No new formatting rules.** The Python code must mirror the legacy behavior described in the PDFs below.

## Legacy PDF / App Script location

The legacy logic (JavaScript/Apps Script, placeholder rules, section mapping, formatting) is to be extracted from:

- **Path:** `D:\HALO Medical\AppScript Fxns`
- **Relevant docs (when added to workspace):** e.g. **admin account.pdf**, **tom debbie.pdf** (or equivalent files in that folder).

**Implementation steps for FastAPI (second pass):**

1. Open the PDFs (or scripts) under `D:\HALO Medical\AppScript Fxns`.
2. Extract: placeholder rules (e.g. `{{field}}`), section mapping, date/line/heading rules.
3. Translate that logic into Python in the `POST /generate_note` handler.
4. Use the same template structure as returned by `/get_templates` (RTDB `users/{user_id}/templates`).

Once the PDFs are in the repo or path is shared, the backend logic can be implemented to match them exactly.

## 2026 Merge Notes (Genesis Alignment)

The app now includes expanded Calendar and Admissions flows. These were merged with backward compatibility so legacy UI calls continue to work during rollout.

### Calendar API compatibility

- `GET /api/calendar/events`
  - New contract: query `start`, `end`, optional `timeZone`.
  - Legacy contract still accepted: `timeMin`, `timeMax`.
- `POST /api/calendar/events`
  - New contract: body `title`, `start`, `end`, optional `patientId`, `attachmentFileIds`, `timeZone`, `description`, `location`.
  - Legacy contract still accepted: `summary`, `startDateTime`, `endDateTime`.
- Additional endpoints used by the new UI:
  - `GET /api/calendar/today`
  - `GET /api/calendar/events/:id`
  - `PATCH /api/calendar/events/:id`
  - `DELETE /api/calendar/events/:id`
  - `POST /api/calendar/events/:id/attachments`
  - `POST /api/calendar/prep-note`

### Admissions API

- `GET /api/drive/admissions-board`
- `PUT /api/drive/admissions-board`

Admissions visibility in the client is controlled by user settings:
- `UserSettings.modules.admissions` (default `false`)

### Validation status

- `npm run build:server` passes.
- `npm run build:client` passes.
- `npm run test:calendar` now includes concrete assertions for calendar normalization and passes.
- Runtime smoke check: `GET /api/health` returns status (currently `partial` if optional integrations such as SMTP are unconfigured).
