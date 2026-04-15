# Halo Patient Concierge

A secure medical patient management system using Google Drive for storage and AI for clinical documentation.

## Features

- **Google OAuth Authentication** with automatic token refresh
- **Google Drive Integration** — patient folders, file upload/delete, clinical notes
- **AI-Powered Tools** (Google Gemini 2.0 Flash)
  - Patient summary generation
  - Lab alert extraction
  - Medical image analysis & smart renaming
  - Voice-to-SOAP note transcription (Deepgram + Gemini fallback)
  - Semantic patient search
- **Modern UI** — React 19, Tailwind CSS, responsive design

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS |
| Backend | Express 5, TypeScript, Node.js |
| Auth | Google OAuth 2.0 (session-based, with refresh tokens) |
| Storage | Google Drive API |
| AI | Google Gemini 2.0 Flash, Deepgram SDK (optional) |

## Getting Started

### Prerequisites

- Node.js 18+
- Google Cloud project with OAuth 2.0 credentials and Drive API enabled
- Google Gemini API key

### Setup

1. **Clone and install dependencies**

```bash
git clone <repo-url>
cd halo-app
npm install
cd client && npm install && cd ..
```

2. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials (see `.env.example` for details).

3. **Run in development**

```bash
npm run dev
```

This starts both the Express server (port 3000) and Vite dev server (port 5173) concurrently.

4. **Build for production**

```bash
npm run build
npm start
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/login-url` | Get Google OAuth URL |
| GET | `/api/auth/callback` | OAuth callback |
| GET | `/api/auth/me` | Check auth status |
| POST | `/api/auth/logout` | Destroy session |

### Drive
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drive/patients` | List patients (paginated) |
| POST | `/api/drive/patients` | Create patient folder |
| PATCH | `/api/drive/patients/:id` | Update patient |
| DELETE | `/api/drive/patients/:id` | Trash patient folder |
| GET | `/api/drive/patients/:id/files` | List files (paginated) |
| POST | `/api/drive/patients/:id/upload` | Upload file |
| POST | `/api/drive/patients/:id/note` | Save clinical note |
| PATCH | `/api/drive/files/:fileId` | Rename file |
| DELETE | `/api/drive/files/:fileId` | Trash file |
| GET | `/api/drive/files/:fileId/download` | Get download URL |

### AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/summary` | Generate patient summary |
| POST | `/api/ai/lab-alerts` | Extract lab alerts |
| POST | `/api/ai/analyze-image` | Analyze medical image |
| POST | `/api/ai/search` | Semantic patient search |
| POST | `/api/ai/transcribe` | Audio → SOAP note |

## Project Structure

```
halo-app/
├── .env.example          # Environment template
├── package.json          # Root monorepo config
├── tsconfig.json         # Server TypeScript config (strict)
├── client/
│   ├── src/
│   │   ├── main.tsx              # App entry
│   │   ├── index.css             # Tailwind CSS entry
│   │   ├── types.ts              # Shared types
│   │   ├── services/api.ts       # API client with error handling
│   │   └── components/           # React components
│   ├── vite.config.ts            # Vite + Tailwind plugin
│   └── tsconfig.app.json         # Client TypeScript config (strict)
└── server/
    ├── index.ts                  # Express app with rate limiting
    ├── middleware/requireAuth.ts  # Auth + token refresh middleware
    └── routes/
        ├── auth.ts               # OAuth with refresh tokens
        ├── drive.ts              # CRUD with validation + pagination
        └── ai.ts                 # AI with retry + safe JSON parsing
```

## Security

- Session secret required via environment variable (no fallback)
- Rate limiting on all routes (stricter for AI and auth)
- Input validation and sanitization on all endpoints
- File type and size restrictions on uploads
- OAuth refresh token handling for seamless session renewal
- HttpOnly, secure, SameSite cookies in production

## Post-Merge Smoke Checklist (Calendar + Admissions)

Run this quick check after major merges to catch regressions early.

### 1) Runtime/API smoke

1. Ensure server is running on `http://localhost:3000`.
2. Check health endpoint:
  - `GET /api/health`
  - Expected: HTTP `200` (`status: "ok"`) or HTTP `207` (`status: "partial"`) with `checks` payload.
3. Check protected endpoints without auth (route existence + guard):
  - `GET /api/calendar/events?start=...&end=...`
  - `GET /api/drive/admissions-board`
  - Expected: HTTP `401` when not signed in.

### 2) Calendar UI smoke

1. Sign in and open **Calendar** from the sidebar.
2. Create an event using title + start/end and save.
3. Edit that event (time/title), save, and confirm updates persist.
4. Drag or resize the event and confirm the new time persists after refresh.
5. Delete the event and confirm it disappears after refresh.
6. For a patient-linked event, open attachments and save selected files.

### 3) Admissions UI smoke

1. In Settings, enable **Admissions board** module.
2. Confirm **Admissions** appears in sidebar and opens correctly.
3. Add a patient card, move it across columns, and refresh.
4. Confirm moved position and movement history remain consistent.
5. Open card drawer, edit diagnosis/tasks/tags/doctors, save, and refresh.

### 4) Build and tests

1. Run `npm run build:server`.
2. Run `npm run build:client`.
3. Run `npm run test:calendar`.
4. Run `npm run test:calendar:routes`.
