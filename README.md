# Workbench

A personal project tracker where Kanban cards drive the progress of plan items on a Gantt timeline, across several projects. Spec: [docs/PRD.md](docs/PRD.md).

- **Board**: five columns, drag and drop (mouse or keyboard), inline rename and due date, progress strip per plan item.
- **Timeline**: custom SVG Gantt with Week, Month and Quarter zoom, drag to move or resize, milestones, progress knob, card due markers, and a drawing-sheet mode.
- **Team**: workload per person, add, rename and remove people per project.
- Command palette (`Ctrl K`), keyboard shortcuts, light and dark themes.

Progress is computed in one place, the `plan_item_progress` SQL view, and served from `/api/summary`.

## Run locally (no Docker)

The API uses SQLite when `DATABASE_URL` is not set.

```bash
cd api
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt   # .venv/bin/pip on Linux/macOS
.venv/Scripts/python -m app.seed demo
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

```bash
cd web
npm install
npm run dev        # http://localhost:5173, proxies /api to :8000
```

Tests: `cd api && .venv/Scripts/python -m pytest -q`.

## Deploy to the home server

```bash
cp .env.example .env     # set POSTGRES_PASSWORD and WORKBENCH_SECRET
docker compose up -d --build
```

The app listens on `127.0.0.1:8080`. To reach it from your other devices over Tailscale with HTTPS:

```bash
tailscale serve --bg 8080
```

Set `WORKBENCH_PASSWORD` in `.env` if you also want a login screen; leave it empty to rely on Tailscale alone.

## Deploy to Vercel

`vercel.json` uses `builds`: `api/main.py` becomes a Python function serving `/api/*`, and the root `package.json` (`vercel-build`) builds `web/` into `web/dist` for everything else. Because `builds` is set, Vercel ignores the dashboard's build settings.

1. Import the repo in Vercel with the **Other** preset, Root Directory left empty, and no build overrides. Do not use the Services preset.
2. Add a Postgres database: Storage tab → **Neon** (sets `DATABASE_URL` for you), or Supabase → Connect → **Transaction pooler** URI (port 6543) pasted into `DATABASE_URL`. Tables go in their own `workbench` schema.
3. Settings → Environment Variables: set `WORKBENCH_PASSWORD` and a long random `WORKBENCH_SECRET`. The API refuses to serve data on Vercel without a password.
4. Redeploy. Load data from your machine against the same database:

```bash
cd api
DATABASE_URL="<Neon connection string>" python -m app.seed import ../data/dic.json
```

## Load data

Demo data (only into an empty database):

```bash
docker compose exec app python -m app.seed demo
```

Migrate the artifact prototype: export its data as JSON, save it as `data/dic.json`, then:

```bash
docker compose exec app python -m app.seed import /data/dic.json
```

Add `--replace` to wipe existing data first. The importer accepts the prototype's field names (`project`, `assignee` on plan items, `link` on cards, `progress`) and the new ones, and also reads the app's own backup from `GET /api/export`.

Backup:

```bash
curl -s http://127.0.0.1:8080/api/export > backup.json
```

## Shortcuts

| Key | Action |
|---|---|
| `Ctrl K` | Command palette |
| `N` | New card |
| `1` `2` `3` | Board, Timeline, Team |
| `/` | Focus search |
| `Enter` | Open the focused card |
| `Space` | Pick up / drop the focused card, arrows to move it |
| `Esc` | Close editor or palette |
| `Ctrl Enter` | Save in an editor |
