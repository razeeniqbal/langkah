# Workbench

Personal project tracker: Kanban cards drive the progress of plan items on a Gantt timeline. Full spec in `docs/PRD.md`; read it before changing behaviour.

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

The app should look like an engineer's planning sheet, not a SaaS template.

Tokens live in `web/src/styles/global.css`. Never hard-code colours in components; use the variables.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #edefea | #141715 | Page |
| `--surface` | #ffffff | #1f2421 | Cards, panels |
| `--ink` | #1b211e | #e5e9e2 | Text, primary buttons, rules |
| `--accent` | #2443b8 | #93a6f2 | Selection, progress (the only accent) |
| `--mark` | #f2d33c | #d8b72a | Today, "me" |
| `--danger` | #c23b22 | #ef7c63 | Late, behind |

- Fonts: Schibsted Grotesk for names and body, IBM Plex Mono (uppercase, tracked) for labels, dates and numbers.
- Hairline 1px rules instead of shadows; 2 to 3px corners. Hard offset shadows (`3px 3px 0 var(--ink)`) only for things lifted off the sheet (drag overlay, palette).
- Remaining work is hatched, done work is solid accent.
- Square monograms, never coloured circle avatars. "Me" gets the highlighter yellow.
- Motion has a purpose: cards settle into a column, bars fill, percentages tick like counters. Respect `prefers-reduced-motion`.
- Dark theme is designed on its own (quieter lines, lighter accent), not an inversion.
- Text must pass WCAG AA in both themes; use `--ink-2` for muted text, never lighter.

### Avoid

- Gradient logos, glassmorphism, soft drop shadows on every card, purple to blue heroes.
- Emoji as icons (use the small SVG set in `components/ui.tsx`), rounded pill buttons, Inter or Space Grotesk.
- Coloured rails on the edge of cards.
- Component kits (MUI, shadcn, etc.) and Gantt libraries.
