# LANGKAH. (repo: workbench)

LANGKAH. ("a step" in Malay; Plan / Track / Deliver) is a personal project tracker: Kanban cards drive the progress of plan items on a Gantt timeline. Full spec in `docs/PRD.md`; read it before changing behaviour.

## Layout

- `api/` FastAPI + SQLAlchemy. `app/db.py` holds the `plan_item_progress` SQL view, the only place progress is computed. `app/routes.py` is all REST endpoints; `app/seed.py` is demo data and the artifact migration.
- `web/` React 18 + Vite + TS. `src/lib/api.ts` (TanStack Query, optimistic card/item updates), `src/lib/store.ts` (Zustand UI state, persisted), `src/lib/data.ts` (scoping and filters). Views in `src/components/`.
- `Dockerfile` builds the web app into the API image; `docker-compose.yml` adds Postgres.

## Rules

- The browser never computes progress or rollups. Read them from `/api/summary`. If a rollup rule changes, change the SQL in `api/app/db.py` and the tests.
- Card `projectId` is always set; when linked it mirrors the plan item's project (the API enforces this).
- Statuses are `backlog | todo | doing | review | done`. Points are 1, 2, 3, 5, 8.
- Run `pytest` in `api/` and `npm run build` in `web/` before finishing a change.

## Commands

```bash
# API (SQLite by default, Postgres via DATABASE_URL)
cd api && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt
python -m app.seed demo
uvicorn app.main:app --reload --port 8000
pytest -q

# Web (proxies /api to :8000)
cd web && npm install && npm run dev
```

## Design rules (keep every session consistent)

Brand: LANGKAH. Every step moves work forward. The name is Malay; every UI label stays in English. The Malay influence is subtle (wordmark, step logo); no batik, skylines or ornamental borders in the workspace.

Tokens live in `web/src/styles/global.css`. Never hard-code colours in components; use the variables. Dark is the default theme; light is a warm-white variant of the same system.

| Token | Dark | Use |
|---|---|---|
| `--bg` | #0C1412 | Page (charcoal green) |
| `--surface` | #17211E | Cards, panels |
| `--surface-2` / `--elev` | #111A17 / #1D2925 | Sidebar, wells / hover, active |
| `--ink` / `--ink-2` | #F2F0E8 / #9AA7A1 | Text / muted text |
| `--line` / `--line-strong` | #24332E / #2E3D38 | Borders |
| `--gold` | #D9B968 | Brand accent: primary buttons, selection, active tab, today, "me" |
| `--accent` | #64BDA2 | Progress only (done work, percentages) |
| `--danger` / `--warn` / `--info` | #F06B70 / #F3BD3E / #4C9DFF | Late, behind / attention / in progress |

- Fonts: Manrope for the interface, IBM Plex Mono (uppercase, tracked) for labels, dates, identifiers and numbers.
- 6px corners on controls, 8px on cards and panels; 1px borders, tonal layering instead of heavy shadows. `--shadow` only for things lifted off the page (drawer, palette, drag overlay, toasts).
- Primary action is a gold button; secondary actions are bordered. Toggle filters are mono chips that turn gold when on.
- Remaining work is a hatched dark track, done work is solid green. Today is a gold dashed line.
- Monograms are rounded squares; "me" is gold.
- Brand marks (logo, wordmark, empty-state illustrations) live in `web/src/components/Brand.tsx`.
- Motion has a purpose: cards settle into a column, bars fill, percentages tick like counters. Respect `prefers-reduced-motion`.
- Text must pass WCAG AA in both themes; use `--ink-2` for muted text, never lighter.

### Avoid

- Gradients as a design language, glassmorphism, soft drop shadows on every card, glows.
- Emoji as icons (use the SVG set in `components/ui.tsx`), oversized rounded pills, Inter or Space Grotesk.
- Decorative UI with no function, new dashboard sections not in the approved design.
- Component kits (MUI, shadcn, etc.) and Gantt libraries.
