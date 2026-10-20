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

Langkah shares one theme with the AI Engineering course tracker (`ai-engineering-course-tracker/app/static/style.css`): Apple's dark system palette, iOS-style grouped surfaces. When the two disagree, the tracker is the reference.

Tokens live in `web/src/styles/global.css`. Never hard-code colours in components; use the variables. Dark is the default theme; light is Apple's light system palette in the same structure.

| Token | Dark | Use |
|---|---|---|
| `--bg` | #000000 | Page (true black) |
| `--surface` | #1C1C1E | Cards, panels |
| `--surface-2` / `--elev` | #0D0D0E / #2C2C2E | Sidebar, wells / hover, fields |
| `--fill` / `--fill-strong` | rgba(118,118,128,.24 / .36) | Button, chip and segmented-control backgrounds |
| `--ink` / `--ink-2` | #FFFFFF / #A1A1A8 | Text / muted text |
| `--line` / `--line-strong` | #38383A / #48484A | Borders, separators |
| `--brand` | #0A84FF | Brand accent: primary buttons, selection, active tab, today, "me" |
| `--accent` | #30D158 | Progress only (done work, percentages) |
| `--danger` / `--warn` / `--info` | #FF453A / #FF9F0A / #64D2FF | Late, behind / attention / in progress |

- Fonts: the system UI stack (SF Pro on Apple, Segoe UI on Windows). Uppercase labels (`.mono`) are the system font at 600 weight, tracked 0.04em, like the tracker's eyebrows. `--font-mono` only for codes, dates and identifiers.
- 10px corners on controls, 14px on cards and panels, pills (999px) for toggle chips. Tonal layering instead of shadows; `--shadow` only for things lifted off the page (drawer, palette, drag overlay, toasts).
- Primary action is a solid blue button; secondary actions are tinted `--fill` buttons. Toggle filters are pill chips that turn solid blue when on. The selected sidebar row is solid blue with white text.
- Remaining work is a hatched dark track, done work is solid green. Today is a blue dashed line.
- Monograms are circles; "me" is blue.
- The app mark is the step logo, white on the blue-to-indigo gradient tile (#0A84FF → #5E5CE6) that the tracker also uses. Brand marks live in `web/src/components/Brand.tsx`.
- Motion has a purpose: cards settle into a column, bars fill, percentages tick like counters. Respect `prefers-reduced-motion`.
- Text must pass WCAG AA in both themes; use `--ink-2` for muted text, never lighter.

### Avoid

- Gradients as a design language (the app-mark tile is the one exception), soft drop shadows on every card, glows.
- Emoji as icons (use the SVG set in `components/ui.tsx`), web fonts (the system stack is the font).
- Decorative UI with no function, new dashboard sections not in the approved design.
- Component kits (MUI, shadcn, etc.) and Gantt libraries.
