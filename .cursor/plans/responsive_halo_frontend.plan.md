---
name: Responsive HALO frontend
overview: End-to-end responsive and adaptive UX for HALO—PC command center, tablet hybrid, and mobile action-oriented layout—with viewport/safe-area fixes, flex-based panes, bottom navigation, chat bottom sheet, coordinated Scribe FAB, and touch-first affordances.
todos:
  - id: foundation-viewport
    content: "Add global layout foundation: dvh/min-h-0 chain, safe-area CSS utilities in index.css; align App.tsx root (h-dvh, flex min-h-0) to kill double-scroll"
    status: pending
  - id: workspace-flex-panes
    content: "Restructure PatientWorkspace content column: flex-1 min-h-0 overflow-hidden; replace NoteEditor/PatientChat h-[600px] with flex-1 min-h-0 + scroll body + sticky footers"
    status: pending
  - id: mobile-nav-chat-sheet
    content: "Below lg: bottom icon nav for overview/notes/scoring + Ask HALO opens ~90dvh bottom sheet (reuse PatientChat); keep horizontal tabs on lg+"
    status: pending
  - id: shell-sidebar-drawer
    content: "Optional drawer or Patients control below md when patient open (state: sidebarOpen); back-to-list still works; Sidebar widths md:w-72 lg:w-80 as needed"
    status: pending
  - id: scribe-fab-coordination
    content: "UniversalScribe: safe-area bottom/right padding; single speed-dial or vertical stack with secondary actions (e.g. jump to Ask HALO sheet) to avoid overlapping FABs"
    status: pending
  - id: touch-hover-pass
    content: "Sidebar/FileBrowser: ≥44px targets; replace hover-only delete with visible overflow menu or touch-friendly row actions"
    status: pending
  - id: tablet-hybrid-polish
    content: "Validate 768–1024px: collapsible patient rail vs overlay; compact header where bottom nav hidden (lg+)"
    status: pending
  - id: pwa-deferred
    content: "Optional follow-up: manifest, icons, theme-color, viewport-fit=cover in index.html when safe-area is stable"
    status: pending
isProject: true
---

# Responsive HALO — implementation plan

## Goals

Deliver explicit UX paradigms—not a shrunk desktop view.

- **Command center (`lg+`, from ~1024px):** Persistent `[Sidebar](../../client/src/components/Sidebar.tsx)`, wide workspace, **horizontal tabs** for modules, AI insights in a **two-column grid** at `lg` (`lg:grid-cols-2` today).
- **Compact / thumb-first (below `lg`):** **Single-column** main content, **fixed bottom navigation** (icons) for Workspace, Notes/Scribe, Scoring, and **Ask HALO**; **Ask HALO** opens as a **bottom sheet** (~90dvh), not only as inline tab content; **44×44px** touch targets; no **hover-only** critical actions; **Scribe FAB** offset for safe-area and bottom nav.
- **Tablet hybrid (roughly `md`–`lg`, 768–1023px):** Same compact nav as phones unless you later split at `md`; **patient list** as **overlay drawer or collapsible rail** (polish pass so iPad is not squeezed beside a full `w-80` rail).

## Design principles (non-negotiables)

1. **Viewport:** Use **h-dvh** / **min-h-[100dvh]** where needed, and **min-h-0** on every flex child that must shrink (root → main → workspace column → editor/chat). Eliminates double scroll and clipped headers.
2. **Safe areas:** Bottom-fixed UI (nav, FAB, sheet) uses `**env(safe-area-inset-bottom)`** via utilities in `[client/src/index.css](../../client/src/index.css)` (e.g. `pb-safe`).
3. **FAB coordination:** `[UniversalScribe](../../client/src/features/scribe/UniversalScribe.tsx)` stays the **primary** capture action; “Ask HALO” is **sheet entry** or a **secondary control on the same stack**—not a second free-floating FAB in the same corner.
4. **Touch:** Minimum **44×44px** hit targets; destructive/secondary actions use a **⋯ menu** or always-visible control—do not rely on `**group-hover`** alone for delete on `[Sidebar](../../client/src/components/Sidebar.tsx)` rows.
5. **Breakpoints:** Tailwind defaults `sm` 640, `md` 768, `**lg` 1024**—`**lg` is the main switch** between bottom nav + sheet vs top tabs + inline panels.

## Audit summary (bottlenecks — already in codebase)

- `[App.tsx](../../client/src/App.tsx)`: `h-screen` + `overflow-hidden`; sidebar **hidden** when a patient is selected on `**md` down**; from workspace, **back** is the only way to the list unless you add a **Patients** drawer/button.
- `[PatientWorkspace.tsx](../../client/src/pages/PatientWorkspace.tsx)`: **Horizontal tabs** with scroll—replaced below `lg` by **bottom nav**; `[NoteEditor](../../client/src/components/NoteEditor.tsx)` and `[PatientChat](../../client/src/components/PatientChat.tsx)` use `**h-[600px]`**, which **breaks** flex layout and causes **nested scroll** on short viewports.
- `[UniversalScribe.tsx](../../client/src/features/scribe/UniversalScribe.tsx)`: **48px** FAB is acceptable; it **must move up** when a **bottom nav** appears and respect **safe-area**.

## Architecture (what changes where)

**Global / shell**

- `[client/src/index.css](../../client/src/index.css)`: Add utilities such as `.pb-safe` using `env(safe-area-inset-bottom)`; optional min-height `dvh` shortcuts.
- `[client/src/App.tsx](../../client/src/App.tsx)`: Root uses **h-dvh**, flex children get **min-h-0**; optional `**sidebarOpen`** and overlay drawer with the same sidebar content (or a slim variant) below `**md**` when a patient is selected.

**Workspace layout**

- `[client/src/pages/PatientWorkspace.tsx](../../client/src/pages/PatientWorkspace.tsx)`:
  - **Structure:** header **shrink-0** → main **flex-1 flex flex-col min-h-0** (nested scroll only where intentional).
  - **Below `lg`:** Hide desktop tab strip; **fixed bottom nav** (`z-40`) with icons: Workspace, Notes/Scribe, Scoring, Ask HALO. Pad main content for **nav height + safe-area**.
  - **Ask HALO below `lg`:** **Controlled bottom sheet** (inset-x-0, bottom-0, **max-h-[90dvh]**, rounded top, backdrop, `**role="dialog"`** consistent with existing modals). Mount `**PatientChat**` in the sheet; same chat state as today.
  - `**lg` and up:** Keep **horizontal tab strip**; chat stays an inline tab (optional split-view later).

**Note editor and chat**

- `[client/src/components/NoteEditor.tsx](../../client/src/components/NoteEditor.tsx)`: **h-full min-h-0 flex flex-col**; textarea **flex-1 min-h-0 overflow-y-auto**; footer **shrink-0**.
- `[client/src/components/PatientChat.tsx](../../client/src/components/PatientChat.tsx)`: Same; messages **flex-1 min-h-0 overflow-y-auto**; suggestion chips **min-h-11** or larger tap area.

**Scribe**

- `[client/src/features/scribe/UniversalScribe.tsx](../../client/src/features/scribe/UniversalScribe.tsx)`: `**bottom: calc(1.5rem + env(safe-area-inset-bottom))`** plus **extra offset below `lg`** above the bottom nav. Optional **secondary control** on the same stack to open the Ask HALO sheet.

**Lists and sidebar**

- `[client/src/components/Sidebar.tsx](../../client/src/components/Sidebar.tsx)`: **⋯ menu** or always-visible delete with **min-w-11 min-h-11**; header controls meet the same minimums.
- `[client/src/components/FileBrowser.tsx](../../client/src/components/FileBrowser.tsx)`: Breadcrumb back and row actions — **≥44px** touch targets.

**State**

- Local to **PatientWorkspace** and **App**: `activeTab`, `chatSheetOpen` (or equivalent), optional `sidebarOpen`. Optional URL hash for tab later.

## Implementation order (dependency-aware)

1. **Foundation** — `index.css` safe-area + `App.tsx` `dvh` / `min-h-0` chain.
2. **Flex panes** — `NoteEditor` / `PatientChat` + `PatientWorkspace` column.
3. **Mobile bottom nav + chat sheet** — wire navigation; chat opens sheet below `lg`.
4. **Shell drawer (optional)** — Patients drawer from workspace below `md`.
5. **Scribe offsets + speed-dial / secondary** — no overlap with nav or home indicator.
6. **Touch/hover pass** — Sidebar + FileBrowser.
7. **Tablet pass** — tune `md`–`lg` widths and drawer vs split.
8. **PWA** — deferred: `manifest`, `viewport-fit=cover`, theme colors.

## Out of scope (unless you expand later)

- Desktop **split view** (files + chat side-by-side) beyond current tabs.
- New design system / full rebrand.
- Backend changes.

## Files touched (expected)

- `[client/src/index.css](../../client/src/index.css)`
- `[client/src/App.tsx](../../client/src/App.tsx)`
- `[client/src/pages/PatientWorkspace.tsx](../../client/src/pages/PatientWorkspace.tsx)`
- `[client/src/components/NoteEditor.tsx](../../client/src/components/NoteEditor.tsx)`
- `[client/src/components/PatientChat.tsx](../../client/src/components/PatientChat.tsx)`
- `[client/src/features/scribe/UniversalScribe.tsx](../../client/src/features/scribe/UniversalScribe.tsx)`
- `[client/src/components/Sidebar.tsx](../../client/src/components/Sidebar.tsx)`
- `[client/src/components/FileBrowser.tsx](../../client/src/components/FileBrowser.tsx)`
- `[client/index.html](../../client/index.html)` (optional, PWA / `viewport-fit` phase)

## Success criteria

- No **fixed `h-[600px]`** panes; editor and chat **fill available height** under header (and bottom nav on mobile) without double scroll.
- **Ask HALO** on phone is a **sheet**, thumb-reachable; keyboard behavior acceptable on first ship.
- **Scribe** FAB never under home indicator or bottom nav.
- **Delete patient** discoverable without hover.
- `**lg+`** familiar (tabs + sidebar); `**md`–`lg**` usable without horizontal squeeze.

